/**
 * Decoded `|request|JSON` — what the client needs to draw move/switch
 * buttons. Only decision-UI fields are modeled. See SIM-PROTOCOL.md.
 */
export interface MoveEntry {
  move: string;
  id?: string;
  pp?: number;
  maxpp?: number;
  target?: string;
  disabled?: boolean;
}

/** One active slot's available moves. */
export interface ActiveSlot {
  moves: MoveEntry[];
}

export interface SidePokemon {
  ident: string;
  details: string;
  condition?: string;
  active: boolean;
  canMegaEvo?: boolean;
  canUltraBurst?: boolean;
  canDynamax?: boolean;
  canTerastallize?: string;
  trapped?: boolean;
  moves: string[];
}

export interface Side {
  name: string;
  id: string;
  pokemon: SidePokemon[];
}

export interface BattleRequest {
  active?: ActiveSlot[];
  side?: Side;
  rqid?: number;
  wait?: boolean;
  teamPreview?: boolean;
  forceSwitch?: (boolean | null)[];
}

export function decodeRequest(json: string): BattleRequest | null {
  try {
    return JSON.parse(json) as BattleRequest;
  } catch {
    return null;
  }
}
