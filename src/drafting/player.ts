import Peer from 'peerjs'

export class Player {
    name: string
    connection!: Peer.DataConnection;

    constructor(name:string) {
        this.name = name;
    }
}