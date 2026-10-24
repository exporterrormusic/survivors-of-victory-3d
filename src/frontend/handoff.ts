// Front end → match boundary. Stage Select calls deployMatch; src/app.ts decides how a
// match starts, so menu scenes never import the Babylon game.
import type { CharacterId } from "../characters";
import type { StageSelection } from "./profile/StageData";

export interface MatchRequest {
  readonly characterId: CharacterId;
  readonly stageSelection: StageSelection;
}

let deployHandler: ((request: MatchRequest) => void) | undefined;

export function onDeploy(handler: (request: MatchRequest) => void): void {
  deployHandler = handler;
}

export function deployMatch(request: MatchRequest): void {
  if (deployHandler === undefined)
    throw new Error("No match handler registered (see src/app.ts)");
  deployHandler(request);
}
