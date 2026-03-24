import type { Principal } from '@icp-sdk/core/principal';
import type { ActorMethod } from '@icp-sdk/core/agent';
import type { IDL } from '@icp-sdk/core/candid';

export interface AddTaskArgs { 'channel' : string, 'payload' : string }
export interface ClaimTaskArgs { 'id' : bigint, 'timeoutNanos' : bigint }
export interface CompleteTaskArgs { 'id' : bigint, 'message' : string }
export interface Task {
  'id' : bigint,
  'status' : bigint,
  'completedAt' : bigint,
  'resultMessage' : string,
  'expiresAt' : bigint,
  'worker' : Principal,
  'channel' : string,
  'payload' : string,
}
export interface _SERVICE {
  'addTask' : ActorMethod<[AddTaskArgs], bigint>,
  'claimTask' : ActorMethod<[ClaimTaskArgs], [] | [Task]>,
  'completeTask' : ActorMethod<[CompleteTaskArgs], boolean>,
  'getAvailableTaskIds' : ActorMethod<[string], Array<bigint>>,
  'getTasks' : ActorMethod<[], Array<Task>>,
  'getTasks2' : ActorMethod<[], Array<Task>>,
}
export declare const idlFactory: IDL.InterfaceFactory;
export declare const init: (args: { IDL: typeof IDL }) => IDL.Type[];
