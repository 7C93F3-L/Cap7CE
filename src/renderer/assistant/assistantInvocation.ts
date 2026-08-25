export interface AssistantInvocation {
  requested: boolean;
  query: string;
}

const assistantPrefix = "7ce/";

export const parseAssistantInvocation = (input: string): AssistantInvocation => {
  const leadingWhitespaceLength = input.length - input.trimStart().length;
  const trimmedStart = input.slice(leadingWhitespaceLength);
  if (!trimmedStart.toLocaleLowerCase().startsWith(assistantPrefix)) {
    return { requested: false, query: input };
  }
  return {
    requested: true,
    query: trimmedStart.slice(assistantPrefix.length).trimStart()
  };
};
