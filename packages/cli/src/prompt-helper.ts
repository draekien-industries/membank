import * as readline from "node:readline";

export class PromptHelper {
  constructor(private readonly autoConfirm: boolean) {}

  confirm(message: string): Promise<boolean> {
    if (this.autoConfirm) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(`${message} [y/N] `, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "y");
      });
    });
  }
}
