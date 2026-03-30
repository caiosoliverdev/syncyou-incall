/**
 * STUN públicos do Google (descoberta de candidatos ICE).
 * TURN não é oferecido gratuitamente pelo Google como o STUN; para relay atrás de NAT
 * restrito configure variáveis de ambiente (ex.: serviço TURN na Google Cloud ou outro fornecedor).
 *
 * `NEXT_PUBLIC_WEBRTC_TURN_URLS` — URLs separadas por vírgula (ex.: turn:relay.example.com:3478)
 * `NEXT_PUBLIC_WEBRTC_TURN_USERNAME` e `NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL`
 */
export function getWebRtcIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ];

  const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_WEBRTC_TURN_URLS : undefined;
  const turnUrls = raw
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const user =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_WEBRTC_TURN_USERNAME : undefined;
  const pass =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL : undefined;

  if (turnUrls && turnUrls.length > 0 && user && pass) {
    servers.push({
      urls: turnUrls,
      username: user,
      credential: pass,
    });
  }

  return servers;
}
