export const idlFactory = ({ IDL }) => {
  const AddTaskArgs = IDL.Record({
    'channel' : IDL.Text,
    'payload' : IDL.Text,
  });
  const ClaimTaskArgs = IDL.Record({
    'id' : IDL.Nat,
    'timeoutNanos' : IDL.Int,
  });
  const Task = IDL.Record({
    'id' : IDL.Nat,
    'status' : IDL.Nat,
    'completedAt' : IDL.Int,
    'resultMessage' : IDL.Text,
    'expiresAt' : IDL.Int,
    'worker' : IDL.Principal,
    'channel' : IDL.Text,
    'payload' : IDL.Text,
  });
  const CompleteTaskArgs = IDL.Record({ 'id' : IDL.Nat, 'message' : IDL.Text });
  return IDL.Service({
    'addTask' : IDL.Func([AddTaskArgs], [IDL.Nat], []),
    'claimTask' : IDL.Func([ClaimTaskArgs], [IDL.Opt(Task)], []),
    'completeTask' : IDL.Func([CompleteTaskArgs], [IDL.Bool], []),
    'getAvailableTaskIds' : IDL.Func([IDL.Text], [IDL.Vec(IDL.Nat)], ['query']),
    'getTasks' : IDL.Func([], [IDL.Vec(Task)], ['query']),
    'getTasks2' : IDL.Func([], [IDL.Vec(Task)], ['query']),
  });
};
export const init = ({ IDL }) => { return []; };
