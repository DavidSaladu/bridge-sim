import { useEffect, useRef, useState } from "react";
import {
  Room as LKRoom,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
} from "livekit-client";

export interface VoiceState {
  status: "off" | "connecting" | "on" | "error";
  muted: boolean;
  speakingIds: Set<string>;
  toggleMute: () => void;
}

export function useVoice(code: string, selfId: string, resumeKey: string | null): VoiceState {
  const [status, setStatus] = useState<VoiceState["status"]>("off");
  const [muted, setMuted] = useState(false);
  const [speakingIds, setSpeakingIds] = useState<Set<string>>(new Set());
  const roomRef = useRef<LKRoom | null>(null);

  useEffect(() => {
    if (!selfId || !resumeKey) return;
    let cancelled = false;
    const lk = new LKRoom();
    roomRef.current = lk;
    const audioEls = new Map<string, HTMLMediaElement[]>();

    async function connect() {
      setStatus("connecting");
      try {
        const res = await fetch(`/api/rooms/${code}/voice`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resumeKey }),
        });
        if (!res.ok) throw new Error(`token ${res.status}`);
        const { token, url } = await res.json();
        if (cancelled) return;

        lk.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, participant) => {
          if (track.kind === Track.Kind.Audio) {
            const el = track.attach();
            document.body.appendChild(el);
            const list = audioEls.get(participant.identity) ?? [];
            list.push(el);
            audioEls.set(participant.identity, list);
          }
        });
        lk.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, _pub, participant) => {
          track.detach().forEach((el) => el.remove());
          audioEls.delete(participant.identity);
        });
        lk.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          setSpeakingIds(new Set(speakers.map((s) => s.identity)));
        });
        lk.on(RoomEvent.Disconnected, () => setStatus("off"));

        await lk.connect(url, token);
        await lk.localParticipant.setMicrophoneEnabled(true);
        if (!cancelled) setStatus("on");
      } catch (err) {
        console.error("voz:", err);
        if (!cancelled) setStatus("error");
      }
    }

    void connect();
    return () => {
      cancelled = true;
      lk.disconnect();
      audioEls.forEach((els) => els.forEach((el) => el.remove()));
    };
  }, [code, selfId, resumeKey]);

  function toggleMute() {
    const lk = roomRef.current;
    if (!lk) return;
    const next = !muted;
    setMuted(next);
    void lk.localParticipant.setMicrophoneEnabled(!next);
  }

  return { status, muted, speakingIds, toggleMute };
}
