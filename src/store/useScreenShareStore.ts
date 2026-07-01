import { create } from 'zustand';
import { signalChannel } from '@/signal/channel';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

type ScreenShareStatus = 'idle' | 'requesting' | 'sharing' | 'watching' | 'ended';

interface ScreenShareState {
  status: ScreenShareStatus;
  screenStream: MediaStream | null;
  remoteScreenStream: MediaStream | null;
  peerConnection: RTCPeerConnection | null;
  sharerId: string | null;
  sharerName: string | null;
  viewerId: string | null;
  audioEnabled: boolean;

  startScreenShare: (myId: string, myName: string) => Promise<void>;
  acceptScreenShare: (myId: string) => Promise<void>;
  rejectScreenShare: (myId: string) => void;
  stopScreenShare: (myId: string) => void;
  toggleAudio: () => void;
  handleSignal: (data: any, senderId: string, senderName?: string) => void;
  _cleanup: () => void;
}

export const useScreenShareStore = create<ScreenShareState>((set, get) => ({
  status: 'idle',
  screenStream: null,
  remoteScreenStream: null,
  peerConnection: null,
  sharerId: null,
  sharerName: null,
  viewerId: null,
  audioEnabled: false,

  startScreenShare: async (myId: string, myName: string) => {
    try {
      set({ status: 'requesting' });

      const stream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: true,
        audio: true,
      });

      const audioTrack = stream.getAudioTracks()[0];
      const audioEnabled = audioTrack ? audioTrack.enabled : false;
      set({ screenStream: stream, sharerId: myId, sharerName: myName, audioEnabled });

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      set({ peerConnection: pc });

      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        set({ remoteScreenStream: event.streams[0] });
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          signalChannel.send('screen_share', {
            action: 'ice-candidate',
            candidate: event.candidate,
          }, myId, myName);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          set({ status: 'sharing' });
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          get()._cleanup();
        }
      };

      stream.getVideoTracks()[0].addEventListener('ended', () => {
        get().stopScreenShare(myId);
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      signalChannel.send('screen_share', {
        action: 'offer',
        offer,
        sharerName: myName,
      }, myId, myName);

    } catch (e) {
      console.error('Failed to start screen share:', e);
      set({ status: 'idle' });
    }
  },

  acceptScreenShare: async (myId: string) => {
    const { peerConnection: existingPc, sharerName } = get();
    if (!existingPc) return;

    try {
      set({ status: 'watching' });
      const answer = await existingPc.createAnswer();
      await existingPc.setLocalDescription(answer);

      signalChannel.send('screen_share', {
        action: 'answer',
        answer,
      }, myId, sharerName || '');
    } catch (e) {
      console.error('Failed to accept screen share:', e);
      get()._cleanup();
    }
  },

  rejectScreenShare: (myId: string) => {
    signalChannel.send('screen_share', { action: 'reject' }, myId);
    get()._cleanup();
  },

  stopScreenShare: (myId: string) => {
    const { sharerId } = get();
    if (sharerId === myId) {
      signalChannel.send('screen_share', { action: 'stop' }, myId);
    }
    get()._cleanup();
  },

  toggleAudio: () => {
    const { screenStream, audioEnabled } = get();
    if (screenStream) {
      const audioTrack = screenStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioEnabled;
        set({ audioEnabled: !audioEnabled });
      }
    }
  },

  handleSignal: (data: any, senderId: string, senderName?: string) => {
    const { status, peerConnection: existingPc, sharerId } = get();

    switch (data.action) {
      case 'offer':
        if (status === 'idle') {
          const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          set({ 
            peerConnection: pc, 
            sharerId: senderId, 
            sharerName: data.sharerName || senderName || '对方',
            status: 'requesting' 
          });

          pc.ontrack = (event) => {
            set({ remoteScreenStream: event.streams[0] });
          };

          pc.onicecandidate = (event) => {
            if (event.candidate) {
              signalChannel.send('screen_share', {
                action: 'ice-candidate',
                candidate: event.candidate,
              }, senderId + '_viewer', 'viewer');
            }
          };

          pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
              set({ status: 'watching' });
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              get()._cleanup();
            }
          };

          pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        }
        break;

      case 'answer':
        if (existingPc && status === 'requesting') {
          existingPc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        break;

      case 'ice-candidate':
        if (existingPc && data.candidate) {
          try {
            existingPc.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (e) {
            console.error('ICE candidate error:', e);
          }
        }
        break;

      case 'reject':
      case 'stop':
        get()._cleanup();
        break;
    }
  },

  _cleanup: () => {
    const { peerConnection, screenStream } = get();
    if (peerConnection) peerConnection.close();
    if (screenStream) screenStream.getTracks().forEach(track => track.stop());
    set({
      status: 'idle',
      screenStream: null,
      remoteScreenStream: null,
      peerConnection: null,
      sharerId: null,
      sharerName: null,
      viewerId: null,
      audioEnabled: false,
    });
  },
}));
