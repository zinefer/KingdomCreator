import Peer from 'peerjs'

import { SetId } from "../dominion/set-id";

export class Player {
    name: string
    connection!: Peer.DataConnection;
    selectedSets: SetId[] = [];
    choosing = false

    constructor(name:string) {
        this.name = name;
    }
}