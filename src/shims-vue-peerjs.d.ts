import Peer from 'peerjs';
 
declare module 'vue/types/vue' {
  interface Vue {
    $peer: Peer;
  }
}