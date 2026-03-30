import {
  emitVoiceCallWebRtcSignal,
  type VoiceCallWebRtcSignal,
} from "@/lib/session-socket";
import {
  getAudioConstraintsForPreferredMic,
  getPreferredMicDeviceId,
  setPreferredMicDeviceId,
} from "@/lib/call-microphone-preference";
import {
  getPreferredCameraDeviceId,
  getVideoConstraintsForPreferredCamera,
  setPreferredCameraDeviceId,
} from "@/lib/call-camera-preference";
import { getWebRtcIceServers } from "@/lib/webrtc-ice-servers";

function buildAudioConstraints(): MediaTrackConstraints {
  const deviceId = getPreferredMicDeviceId();
  const pref = getAudioConstraintsForPreferredMic(deviceId);
  return {
    ...pref,
    echoCancellation: true,
    noiseSuppression: true,
  };
}

export async function getUserMediaAudioForCall(): Promise<MediaStream> {
  const tryOnce = (audio: MediaTrackConstraints | boolean) =>
    navigator.mediaDevices.getUserMedia({
      audio,
      video: false,
    });

  try {
    return await tryOnce(buildAudioConstraints());
  } catch (e) {
    const name = e instanceof DOMException ? e.name : (e as Error)?.name;
    if (name === "OverconstrainedError" || name === "NotFoundError") {
      setPreferredMicDeviceId(null);
      try {
        return await tryOnce({
          echoCancellation: true,
          noiseSuppression: true,
        });
      } catch {
        return await tryOnce(true);
      }
    }
    if (name === "NotReadableError") {
      try {
        return await tryOnce(true);
      } catch {
        /* fallthrough */
      }
    }
    throw e;
  }
}

function buildVideoConstraints(): MediaTrackConstraints {
  const deviceId = getPreferredCameraDeviceId();
  const pref = getVideoConstraintsForPreferredCamera(deviceId);
  return {
    ...pref,
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };
}

export async function getUserMediaVideoForCall(): Promise<MediaStream> {
  const tryOnce = (video: MediaTrackConstraints | boolean) =>
    navigator.mediaDevices.getUserMedia({ audio: false, video });

  try {
    return await tryOnce(buildVideoConstraints());
  } catch (e) {
    const name = e instanceof DOMException ? e.name : (e as Error)?.name;
    if (name === "OverconstrainedError" || name === "NotFoundError") {
      setPreferredCameraDeviceId(null);
      try {
        return await tryOnce({
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        });
      } catch {
        return await tryOnce(true);
      }
    }
    if (name === "NotReadableError") {
      try {
        return await tryOnce(true);
      } catch {
        /* fallthrough */
      }
    }
    throw e;
  }
}

export async function getDisplayMediaForCall(): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: false,
  });
}

/** Heurística para distinguir captura de ecrã de câmera (segundo fluxo de vídeo). */
export function isScreenCaptureTrack(track: MediaStreamTrack): boolean {
  if (track.kind !== "video") return false;
  const hint = (track as { contentHint?: string }).contentHint;
  if (hint === "detail" || hint === "text") return true;
  try {
    const s = track.getSettings?.() ?? {};
    const ds = (s as { displaySurface?: string }).displaySurface;
    if (ds === "monitor" || ds === "window" || ds === "browser") return true;
  } catch {
    /* ignore */
  }
  const label = track.label || "";
  return /screen|entire|Window|window|display|Chrome|Firefox|Desktop|Captura|monitor|tab|Tab|com\.apple/i.test(
    label,
  );
}

/**
 * Sessão WebRTC 1:1 com áudio, vídeo opcional e partilha de ecrã (segundo sender de vídeo).
 */
export class DirectVoiceCallSession {
  private readonly pc: RTCPeerConnection;
  private audioSender: RTCRtpSender | null = null;
  private videoSender: RTCRtpSender | null = null;
  private screenSender: RTCRtpSender | null = null;
  /** Só faixa de áudio do microfone. */
  private localStream: MediaStream | null = null;
  private localVideoStream: MediaStream | null = null;
  private localScreenStream: MediaStream | null = null;
  private cameraEnabled = false;
  private screenSharingLocal = false;
  private readonly pendingIce: RTCIceCandidateInit[] = [];
  private started = false;
  private destroyed = false;
  private readonly pendingRemote: VoiceCallWebRtcSignal[] = [];
  private micMuted = false;
  /** Timeouts para reclassificar vídeo remoto (displaySurface pode aparecer tarde). */
  private remoteVideoClassifyTimers: number[] = [];
  private onLocalStreamChange: ((stream: MediaStream | null) => void) | null = null;
  private onLocalVideoStreamChange: ((stream: MediaStream | null) => void) | null = null;
  private onLocalScreenStreamChange: ((stream: MediaStream | null) => void) | null = null;
  private onRemoteAudioStream: ((stream: MediaStream) => void) | null = null;
  private onRemoteCameraStream: ((stream: MediaStream | null) => void) | null = null;
  private onRemoteScreenStream: ((stream: MediaStream | null) => void) | null = null;

  constructor(
    private readonly conversationId: string,
    private readonly role: "caller" | "callee",
  ) {
    this.pc = new RTCPeerConnection({
      iceServers: getWebRtcIceServers(),
      iceCandidatePoolSize: 4,
    });
    this.pc.onicecandidate = (ev) => {
      if (!ev.candidate || this.destroyed) return;
      emitVoiceCallWebRtcSignal({
        conversationId: this.conversationId,
        signal: { type: "ice-candidate", candidate: ev.candidate.toJSON() },
      });
    };
    this.pc.ontrack = (ev) => {
      if (this.destroyed) return;
      let stream = ev.streams[0];
      if (!stream) {
        stream = new MediaStream([ev.track]);
      }
      if (ev.track.kind === "audio") {
        const audioOnly = new MediaStream(stream.getAudioTracks());
        this.onRemoteAudioStream?.(audioOnly);
      } else if (ev.track.kind === "video") {
        this.handleRemoteVideoTrack(ev.track);
      }
    };
  }

  /**
   * Encaminha câmera vs ecrã. Sem câmera local, o único vídeo pode ser ecrã mas
   * `getSettings().displaySurface` só fica disponível logo após o primeiro frame.
   */
  private handleRemoteVideoTrack(track: MediaStreamTrack): void {
    const vStream = new MediaStream([track]);
    let routed: "cam" | "screen" | null = null;

    const clearRouted = () => {
      if (routed === "cam") this.onRemoteCameraStream?.(null);
      if (routed === "screen") this.onRemoteScreenStream?.(null);
      routed = null;
    };

    const applyRoute = () => {
      if (this.destroyed) return;
      const want: "cam" | "screen" = isScreenCaptureTrack(track) ? "screen" : "cam";
      if (routed === want) return;
      clearRouted();
      routed = want;
      if (want === "screen") {
        this.onRemoteScreenStream?.(vStream);
      } else {
        this.onRemoteCameraStream?.(vStream);
      }
    };

    track.addEventListener(
      "ended",
      () => {
        clearRouted();
      },
      { once: true },
    );

    applyRoute();

    const pick = () => {
      applyRoute();
    };
    track.addEventListener("unmute", pick, { once: true });
    for (const ms of [0, 50, 120, 300, 700]) {
      const id = window.setTimeout(() => {
        if (this.destroyed) return;
        pick();
      }, ms);
      this.remoteVideoClassifyTimers.push(id);
    }
  }

  setOnLocalStreamChange(cb: (stream: MediaStream | null) => void): void {
    this.onLocalStreamChange = cb;
    cb(this.localStream);
  }

  setOnLocalVideoStreamChange(cb: (stream: MediaStream | null) => void): void {
    this.onLocalVideoStreamChange = cb;
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
    this.started = true;
    for (const sig of this.pendingRemote.splice(0)) {
      await this.handleRemoteInternal(sig);
    }
    if (this.role === "caller") {
      await this.callerSetupTransceivers();
      await this.applyMicMuted(this.micMuted);
      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await this.pc.setLocalDescription(offer);
      emitVoiceCallWebRtcSignal({
        conversationId: this.conversationId,
        signal: { type: "offer", sdp: this.pc.localDescription!.sdp! },
      });
    }
  }

  async handleRemote(signal: VoiceCallWebRtcSignal): Promise<void> {
    if (!this.started) {
      this.pendingRemote.push(signal);
      return;
    }
    await this.handleRemoteInternal(signal);
  }

  async refreshMicrophoneFromPreference(): Promise<void> {
    if (this.destroyed || this.micMuted) return;
    await this.applyMicMuted(false);
  }

  async refreshCameraFromPreference(): Promise<void> {
    if (this.destroyed || !this.cameraEnabled || !this.videoSender) return;
    this.localVideoStream?.getVideoTracks().forEach((t) => t.stop());
    const stream = await getUserMediaVideoForCall();
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.localVideoStream = stream;
    const vt = stream.getVideoTracks()[0];
    if (vt) await this.videoSender.replaceTrack(vt);
    this.onLocalVideoStreamChange?.(stream);
  }

  /**
   * Liga ou desliga partilha de ecrã (segundo vídeo). Requer renegociação na primeira vez.
   */
  async setScreenSharingEnabled(enabled: boolean): Promise<void> {
    if (this.destroyed) return;

    if (!enabled) {
      this.screenSharingLocal = false;
      this.localScreenStream?.getTracks().forEach((t) => t.stop());
      this.localScreenStream = null;
      this.onLocalScreenStreamChange?.(null);
      if (this.screenSender) {
        await this.screenSender.replaceTrack(null);
      }
      return;
    }

    if (!this.screenSender) {
      const tx = this.pc.addTransceiver("video", { direction: "sendrecv" });
      this.screenSender = tx.sender;
    }

    let stream: MediaStream;
    try {
      stream = await getDisplayMediaForCall();
    } catch {
      if (this.screenSender && !this.localScreenStream) {
        await this.screenSender.replaceTrack(null);
      }
      return;
    }

    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    this.localScreenStream?.getTracks().forEach((t) => t.stop());
    this.localScreenStream = stream;
    const vt = stream.getVideoTracks()[0];
    if (vt) {
      vt.addEventListener("ended", () => {
        void this.setScreenSharingEnabled(false);
      });
      await this.screenSender.replaceTrack(vt);
    }
    this.screenSharingLocal = true;
    this.onLocalScreenStreamChange?.(stream);
    await this.negotiateOffer();
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (this.destroyed) return;

    this.cameraEnabled = enabled;
    if (!this.videoSender) return;

    if (!enabled) {
      this.localVideoStream?.getVideoTracks().forEach((t) => t.stop());
      this.localVideoStream = null;
      await this.videoSender.replaceTrack(null);
      this.onLocalVideoStreamChange?.(null);
      return;
    }

    const stream = await getUserMediaVideoForCall();
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.localVideoStream?.getVideoTracks().forEach((t) => t.stop());
    this.localVideoStream = stream;
    const vt = stream.getVideoTracks()[0];
    if (vt) await this.videoSender.replaceTrack(vt);
    this.onLocalVideoStreamChange?.(stream);
  }

  private async negotiateOffer(): Promise<void> {
    if (this.destroyed) return;
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.pc.setLocalDescription(offer);
    emitVoiceCallWebRtcSignal({
      conversationId: this.conversationId,
      signal: { type: "offer", sdp: this.pc.localDescription!.sdp! },
    });
  }

  private async flushPendingIce(): Promise<void> {
    const copy = this.pendingIce.splice(0);
    for (const c of copy) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* candidato inválido ou PC fechado */
      }
    }
  }

  private calleeWireTransceivers(): void {
    if (this.audioSender && this.videoSender) return;
    const txs = this.pc.getTransceivers();
    if (txs.length >= 2) {
      this.audioSender = txs[0]!.sender;
      this.videoSender = txs[1]!.sender;
    } else if (txs.length === 1) {
      this.audioSender = txs[0]!.sender;
      this.videoSender = null;
    }
  }

  private async callerSetupTransceivers(): Promise<void> {
    if (this.audioSender) return;
    const a = this.pc.addTransceiver("audio", { direction: "sendrecv" });
    this.audioSender = a.sender;
    const v = this.pc.addTransceiver("video", { direction: "sendrecv" });
    this.videoSender = v.sender;
  }

  private async handleRemoteInternal(signal: VoiceCallWebRtcSignal): Promise<void> {
    if (this.destroyed) return;
    if (signal.type === "offer") {
      await this.pc.setRemoteDescription({ type: "offer", sdp: signal.sdp });
      await this.flushPendingIce();
      if (this.role === "callee") {
        this.calleeWireTransceivers();
        await this.applyMicMuted(this.micMuted);
      }
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      emitVoiceCallWebRtcSignal({
        conversationId: this.conversationId,
        signal: { type: "answer", sdp: this.pc.localDescription!.sdp! },
      });
    } else if (signal.type === "answer") {
      await this.pc.setRemoteDescription({ type: "answer", sdp: signal.sdp });
      await this.flushPendingIce();
    } else if (signal.type === "ice-candidate" && signal.candidate) {
      if (!this.pc.remoteDescription) {
        this.pendingIce.push(signal.candidate);
      } else {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch {
          /* ignore */
        }
      }
    }
  }

  async setMicMuted(muted: boolean): Promise<void> {
    this.micMuted = muted;
    if (!this.audioSender) return;
    await this.applyMicMuted(muted);
  }

  private notifyLocalStream(): void {
    this.onLocalStreamChange?.(this.localStream);
  }

  private async applyMicMuted(muted: boolean): Promise<void> {
    if (this.destroyed) return;
    if (!this.audioSender) return;
    if (muted) {
      this.localStream?.getTracks().forEach((t) => t.stop());
      this.localStream = null;
      await this.audioSender.replaceTrack(null);
      this.notifyLocalStream();
      return;
    }
    const stream = await getUserMediaAudioForCall();
    if (this.destroyed) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = stream;
    const track = stream.getAudioTracks()[0];
    if (track) await this.audioSender.replaceTrack(track);
    this.notifyLocalStream();
  }

  destroy(): void {
    this.destroyed = true;
    for (const id of this.remoteVideoClassifyTimers) {
      clearTimeout(id);
    }
    this.remoteVideoClassifyTimers.length = 0;
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;
    this.onLocalStreamChange?.(null);
    this.localVideoStream?.getVideoTracks().forEach((t) => t.stop());
    this.localVideoStream = null;
    this.onLocalVideoStreamChange?.(null);
    this.localScreenStream?.getTracks().forEach((t) => t.stop());
    this.localScreenStream = null;
    this.onLocalScreenStreamChange?.(null);
    this.onRemoteCameraStream?.(null);
    this.onRemoteScreenStream?.(null);
    this.pc.close();
  }
}
