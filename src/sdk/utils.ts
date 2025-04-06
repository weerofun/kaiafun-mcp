import { Abi, ContractEventName, TransactionReceipt, decodeEventLog } from 'viem';

export const getEventFromReceipt = <
  const abi extends Abi | readonly unknown[],
  eventName extends ContractEventName<abi> | undefined = undefined,
>(
  receipt: TransactionReceipt | void,
  abi: abi,
  eventName: eventName,
) => {
  return receipt?.logs
    .map((log) => {
      try {
        return decodeEventLog({ abi, data: log.data, topics: log.topics });
      } catch {
        return undefined;
      }
    })
    .find((log) => log?.eventName === eventName);
};
