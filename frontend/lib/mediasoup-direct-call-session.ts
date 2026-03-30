"use client";

import { Device, detectDevice } from "mediasoup-client";
import type {
  Consumer,
  DtlsParameters,
  IceCandidate,
  IceParameters,
  Producer,
  RtpCapabilities,
  RtpParameters,
  Transport,
} from "mediasoup-client/types";
import {
  getDisplayMediaForCall,
  getUserMediaAudioForCall,
  getUserMediaVideoForCall,
  isScreenCaptureTrack,
} from "@/lib/direct-voice-call-audio";
import {
  emitMediasoupRpc,
  type MediasoupClosedProducerPayload,
  type MediasoupNewProducerPayload,
  type VoiceCallWebRtcSignal,
} from "@/lib/session-socket";

type JoinOk = {
  ok: true;
  rtpCapabilities: RtpCapabilities;
  existingProducers: Array<{
    producerId: string;
    producerUserId: string;
    kind: string;
    appData?: { source?: string };
  }>;
};

type TransportCreated = {
  ok: true;
  id: string;
  iceParameters: IceParameters;
  iceCandidates: IceCandidate[];
  dtlsParameters: DtlsParameters;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Alguns browsers / WebViews / bundlers não preenchem UA como o `detectDevice()` espera;
 * tenta o handler detectado e depois Chromium → Safari → Firefox.
 */
async function createDeviceLoaded(routerRtpCapabilities: RtpCapabilities): Promise<Device> {
  const names: string[] = [];
  if (typeof window !== "undefined") {
    const d = detectDevice();
    if (d) names.push(d);
  }
  for (const h of ["Chrome111", "Chrome74", "Safari12", "Firefox120"] as const) {
    if (!names.includes(h)) names.push(h);
  }

  let lastErr: unknown;
  for (const handlerName of names) {
    try {
      const device = new Device({
        handlerName: handlerName as NonNullable<ConstructorParameters<typeof Device>[0]>["handlerName"],
      });
      await device.load({ routerRtpCapabilities });
      return device;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("mediasoup_device_unsupported");
}

/**
 * Chamada 1:1 via SFU Mediasoup (sinalização Socket.IO `mediasoup_*`).
 */
export class MediasoupDirectCallSession {
  private readonly conversationId: string;
  private destroyed = false;
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private micMuted = false;
  private cameraEnabled = false;
  private screenSharingLocal = false;
  private localStream: MediaStream | null = null;
  private localVideoStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private audioProducer: Producer | null = null;
  private cameraProducer: Producer | null = null;
  private screenProducer: Producer | null = null;
  private readonly consumedProducers = new Set<string>();
  private readonly pendingProducers: MediasoupNewProducerPayload[] = [];
  private readonly remoteProducerSourceById = new Map<string, "camera" | "screen" | "audio">();
  private recvSetupDone = false;

  private onLocalStreamChange: ((stream: MediaStream | null) => void) | null = null;
  private onLocalVideoStreamChangeClient: ((stream: MediaStream | null) => void) | null = null;
  private onLocalScreenStreamChange: ((stream: MediaStream | null) => void) | null = null;
  private onRemoteAudioStream: ((stream: MediaStream) => void) | null = null;
  private onRemoteCameraStream: ((stream: MediaStream | null) => void) | null = null;
  private onRemoteScreenStream: ((stream: MediaStream | null) => void) | null = null;

  constructor(conversationId: string) {
    this.conversationId = conversationId;
  }

  setOnLocalStreamChange(cb: (stream: MediaStream | null) => void): void {
    this.onLocalStreamChange = cb;
    cb(this.localStream);
  }

  setOnLocalVideoStreamChange(cb: (stream: MediaStream | null) => void): void {
    this.onLocalVideoStreamChangeClient = cb;
    cb(this.localVideoStream);
  }

  setOnLocalScreenStreamChange(cb: (stream: MediaStream | null) => void): void {
    this.onLocalScreenStreamChange = cb;
    cb(this.localScreenStream);
  }

  setOnRemoteAudioStream(cb: (stream: MediaStream) => void): void {
    this.onRemoteAudioStream = cb;
  }

  setOnRemoteCameraStream(cb: (stream: MediaStream | null) => void): void {
    this.onRemoteCameraStream = cb;
  }

  setOnRemoteScreenStream(cb: (stream: MediaStream | null) => void): void {
    this.onRemoteScreenStream = cb;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  isScreenSharing(): boolean {
    return this.screenSharingLocal;
  }

  async start(initialMuted: boolean): Promise<void> {
    this.micMuted = initialMuted;
    const join = (await emitMediasoupRpc("mediasoup_join", {
      conversationId: this.conversationId,
    })) as JoinOk | { ok: false; error?: string };

    if (!isRecord(join) || join.ok !== true || !join.rtpCapabilities) {
      throw new Error("mediasoup_join_failed");
    }

    this.device = await createDeviceLoaded(join.rtpCapabilities);

    await this.createRecvTransport();
    await this.createSendTransport();

    for (const ep of join.existingProducers ?? []) {
      await this.consumeRemoteProducer(ep.producerId, ep.kind, ep.appData);
    }

    this.recvSetupDone = true;
    const queued = this.pendingProducers.splice(0);
    for (const q of queued) {
      await this.consumeRemoteProducer(q.producerId, q.kind, q.appData as { source?: string });
    }

    if (!initialMuted) {
      await this.ensureAudioProducer();
    }
  }

  /** Chamado pelo hook quando chega `mediasoup_new_producer`. */
  async ingestRemoteProducer(payload: MediasoupNewProducerPayload): Promise<void> {
    if (this.destroyed || payload.conversationId !== this.conversationId) return;
    if (this.consumedProducers.has(payload.producerId)) return;
    if (!this.recvSetupDone) {
      this.pendingProducers.push(payload);
      return;
    }
    await this.consumeRemoteProducer(
      payload.producerId,
      payload.kind,
      payload.appData as { source?: string } | undefined,
    );
  }

  handleRemoteProducerClosed(payload: MediasoupClosedProducerPayload): void {
    if (this.destroyed || payload.conversationId !== this.conversationId) return;
    this.consumedProducers.delete(payload.producerId);
    const source =
      this.remoteProducerSourceById.get(payload.producerId) ??
      (payload.kind === "audio"
        ? "audio"
        : payload.appData?.source === "screen"
          ? "screen"
          : "camera");
    this.remoteProducerSourceById.delete(payload.producerId);

    if (source === "screen") {
      this.onRemoteScreenStream?.(null);
      return;
    }
    if (source === "camera") {
      this.onRemoteCameraStream?.(null);
    }
  }

  private async closeProducerOnServer(producer: Producer | null): Promise<void> {
    if (!producer) return;
    try {
      await emitMediasoupRpc("mediasoup_close_producer", {
        conversationId: this.conversationId,
        producerId: producer.id,
      });
    } catch {
      /* best effort: local cleanup still runs */
    }
  }

  private async createRecvTransport(): Promise<void> {
    const res = (await emitMediasoupRpc("mediasoup_create_transport", {
      conversationId: this.conversationId,
      direction: "recv",
    })) as TransportCreated | { ok: false };

    if (!isRecord(res) || res.ok !== true || typeof res.id !== "string") {
      throw new Error("mediasoup_recv_transport");
    }

    this.recvTransport = this.device!.createRecvTransport({
      id: res.id,
      iceParameters: res.iceParameters,
      iceCandidates: res.iceCandidates,
      dtlsParameters: res.dtlsParameters,
    });

    this.recvTransport.on(
      "connect",
      (
        { dtlsParameters }: { dtlsParameters: DtlsParameters },
        callback: () => void,
        errback: (e: Error) => void,
      ) => {
      void emitMediasoupRpc("mediasoup_connect_transport", {
        conversationId: this.conversationId,
        transportId: this.recvTransport!.id,
        dtlsParameters,
      })
        .then((r: unknown) => {
          if (isRecord(r) && r.ok === true) callback();
          else errback(new Error("recv_connect_failed"));
        })
        .catch(errback);
      },
    );
  }

  private async createSendTransport(): Promise<void> {
    const res = (await emitMediasoupRpc("mediasoup_create_transport", {
      conversationId: this.conversationId,
      direction: "send",
    })) as TransportCreated | { ok: false };

    if (!isRecord(res) || res.ok !== true || typeof res.id !== "string") {
      throw new Error("mediasoup_send_transport");
    }

    this.sendTransport = this.device!.createSendTransport({
      id: res.id,
      iceParameters: res.iceParameters,
      iceCandidates: res.iceCandidates,
      dtlsParameters: res.dtlsParameters,
    });

    this.sendTransport.on(
      "connect",
      (
        { dtlsParameters }: { dtlsParameters: DtlsParameters },
        callback: () => void,
        errback: (e: Error) => void,
      ) => {
      void emitMediasoupRpc("mediasoup_connect_transport", {
        conversationId: this.conversationId,
        transportId: this.sendTransport!.id,
        dtlsParameters,
      })
        .then((r: unknown) => {
          if (isRecord(r) && r.ok === true) callback();
          else errback(new Error("send_connect_failed"));
        })
        .catch(errback);
      },
    );

    this.sendTransport.on(
      "produce",
      (
        {
          kind,
          rtpParameters,
          appData,
        }: {
          kind: "audio" | "video";
          rtpParameters: RtpParameters;
          appData: Record<string, unknown>;
        },
        callback: (args: { id: string }) => void,
        errback: (e: Error) => void,
      ) => {
      void emitMediasoupRpc("mediasoup_produce", {
        conversationId: this.conversationId,
        transportId: this.sendTransport!.id,
        kind,
        rtpParameters,
        appData,
      })
        .then((r: unknown) => {
          if (
            isRecord(r) &&
            r.ok === true &&
            typeof (r as { id?: string }).id === "string"
          ) {
            callback({ id: (r as { id: string }).id });
          } else errback(new Error("produce_failed"));
        })
        .catch(errback);
      },
    );
  }

  private async consumeRemoteProducer(
    producerId: string,
    kind: string,
    appData?: { source?: string },
  ): Promise<void> {
    if (this.destroyed || !this.device || !this.recvTransport) return;
    if (this.consumedProducers.has(producerId)) return;
    if (kind !== "audio" && kind !== "video") return;

    const raw = await emitMediasoupRpc("mediasoup_consume", {
      conversationId: this.conversationId,
      transportId: this.recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    if (!isRecord(raw) || raw.ok !== true) return;
    const id = typeof raw.id === "string" ? raw.id : undefined;
    const consKind = raw.kind === "audio" || raw.kind === "video" ? raw.kind : kind;
    const rtpParameters = raw.rtpParameters as RtpParameters | undefined;
    const serverProducerId =
      typeof raw.producerId === "string" ? raw.producerId : producerId;
    if (!id || !rtpParameters) return;

    const consumer: Consumer = await this.recvTransport.consume({
      id,
      producerId: serverProducerId,
      kind: consKind,
      rtpParameters,
    });

    await emitMediasoupRpc("mediasoup_resume_consumer", {
      conversationId: this.conversationId,
      consumerId: consumer.id,
    });
    await consumer.resume();

    this.consumedProducers.add(producerId);

    const track = consumer.track;
    if (consumer.kind === "audio") {
      this.remoteProducerSourceById.set(producerId, "audio");
      this.onRemoteAudioStream?.(new MediaStream([track]));
      return;
    }

    let source: "camera" | "screen" =
      appData?.source === "screen" ? "screen" : "camera";
    if (source === "camera" && isScreenCaptureTrack(track)) source = "screen";
    this.remoteProducerSourceById.set(producerId, source);

    const clearScreen = () => {
      this.remoteProducerSourceById.delete(producerId);
      this.consumedProducers.delete(producerId);
      this.onRemoteScreenStream?.(null);
    };
    const clearCam = () => {
      this.remoteProducerSourceById.delete(producerId);
      this.consumedProducers.delete(producerId);
      this.onRemoteCameraStream?.(null);
    };

    if (source === "screen") {
      this.onRemoteScreenStream?.(new MediaStream([track]));
      track.addEventListener("ended", clearScreen, { once: true });
      consumer.observer.once("close", clearScreen);
    } else {
      this.onRemoteCameraStream?.(new MediaStream([track]));
      track.addEventListener("ended", clearCam, { once: true });
      consumer.observer.once("close", clearCam);
    }
  }

  private async ensureAudioProducer(): Promise<void> {
    if (this.destroyed || !this.sendTransport || this.micMuted || this.audioProducer) return;
    const stream = await getUserMediaAudioForCall();
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = stream;
    this.onLocalStreamChange?.(stream);
    const track = stream.getAudioTracks()[0];
    if (!track) return;
    this.audioProducer = await this.sendTransport.produce({ track, appData: { source: "mic" } });
  }

  private stopLocalMic(): void {
    const producer = this.audioProducer;
    void this.closeProducerOnServer(producer);
    producer?.close();
    this.audioProducer = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.onLocalStreamChange?.(null);
  }

  async setMicMuted(muted: boolean): Promise<void> {
    this.micMuted = muted;
    if (muted) this.stopLocalMic();
    else await this.ensureAudioProducer();
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    this.cameraEnabled = enabled;
    if (!this.sendTransport) return;

    if (!enabled) {
      const producer = this.cameraProducer;
      await this.closeProducerOnServer(producer);
      producer?.close();
      this.cameraProducer = null;
      this.localVideoStream?.getVideoTracks().forEach((t) => t.stop());
      this.localVideoStream = null;
      this.onLocalVideoStreamChangeClient?.(null);
      return;
    }

    this.localVideoStream?.getVideoTracks().forEach((t) => t.stop());
    const stream = await getUserMediaVideoForCall();
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.localVideoStream = stream;
    this.onLocalVideoStreamChangeClient?.(stream);
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    if (this.cameraProducer) {
      await this.cameraProducer.replaceTrack({ track });
    } else {
      this.cameraProducer = await this.sendTransport.produce({
        track,
        appData: { source: "camera" },
      });
    }
  }

  async refreshMicrophoneFromPreference(): Promise<void> {
    if (this.destroyed || this.micMuted || !this.audioProducer) return;
    const stream = await getUserMediaAudioForCall();
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = stream;
    this.onLocalStreamChange?.(stream);
    const track = stream.getAudioTracks()[0];
    if (track) await this.audioProducer.replaceTrack({ track });
  }

  async refreshCameraFromPreference(): Promise<void> {
    if (this.destroyed || !this.cameraEnabled || !this.cameraProducer) return;
    const stream = await getUserMediaVideoForCall();
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.localVideoStream?.getVideoTracks().forEach((t) => t.stop());
    this.localVideoStream = stream;
    this.onLocalVideoStreamChangeClient?.(stream);
    const track = stream.getVideoTracks()[0];
    if (track) await this.cameraProducer.replaceTrack({ track });
  }

  async setScreenSharingEnabled(enabled: boolean): Promise<void> {
    if (this.destroyed || !this.sendTransport) return;

    if (!enabled) {
      this.screenSharingLocal = false;
      const producer = this.screenProducer;
      await this.closeProducerOnServer(producer);
      producer?.close();
      this.screenProducer = null;
      this.localScreenStream?.getTracks().forEach((t) => t.stop());
      this.localScreenStream = null;
      this.onLocalScreenStreamChange?.(null);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await getDisplayMediaForCall();
    } catch {
      return;
    }
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.localScreenStream?.getTracks().forEach((t) => t.stop());
    this.localScreenStream = stream;
    this.onLocalScreenStreamChange?.(stream);
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    track.addEventListener(
      "ended",
      () => {
        void this.setScreenSharingEnabled(false);
      },
      { once: true },
    );
    this.screenProducer = await this.sendTransport.produce({
      track,
      appData: { source: "screen" },
    });
    this.screenSharingLocal = true;
  }

  async handleRemote(sig: VoiceCallWebRtcSignal): Promise<void> {
    void sig;
    /* P2P só — Mediasoup não usa SDP relayado */
  }

  destroy(): void {
    this.destroyed = true;
    this.audioProducer?.close();
    this.cameraProducer?.close();
    this.screenProducer?.close();
    this.audioProducer = null;
    this.cameraProducer = null;
    this.screenProducer = null;
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.sendTransport = null;
    this.recvTransport = null;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localVideoStream?.getVideoTracks().forEach((t) => t.stop());
    this.localScreenStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.localVideoStream = null;
    this.localScreenStream = null;
    this.onLocalStreamChange?.(null);
    this.onLocalVideoStreamChangeClient?.(null);
    this.onLocalScreenStreamChange?.(null);
    this.onRemoteCameraStream?.(null);
    this.onRemoteScreenStream?.(null);
    void emitMediasoupRpc("mediasoup_leave", { conversationId: this.conversationId }).catch(
      () => undefined,
    );
  }
}
