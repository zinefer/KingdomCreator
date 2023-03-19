import { Peer, DataConnection } from 'peerjs'

import { SetId } from "../dominion/set-id";

export class Player {
    name: string
    connection!: DataConnection;
    selectedSets: SetId[] = [];
    current = false;
    auditing = false;
    connected = true;

    constructor(name:string) {
        this.name = name;
    }
}