import { confirm } from "@clack/prompts";

export class PromptHelper {
  constructor(private readonly autoConfirm: boolean) {}

  async confirm(message: string): Promise<boolean> {
    if (this.autoConfirm) {
      return true;
    }

    const result = await confirm({ message });
    // clack returns Symbol if the user cancels (Ctrl+C)
    if (typeof result === "symbol") {
      return false;
    }
    return result;
  }
}
