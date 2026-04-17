import "server-only";

export function buildCommentary(input: {
  originalPrompt: string;
  effectivePrompt: string;
  keepSeed: boolean;
  parentExists: boolean;
}) {
  if (!input.parentExists) {
    return `这张图根据你的提示词生成，核心描述是：${input.originalPrompt}。系统已经把提示词整理成更适合生图模型理解的形式，并输出了最终图像。`;
  }

  return [
    "这次是在上一张图的基础语义上继续生成的。",
    input.keepSeed ? "系统尽量沿用了原有随机种子，以帮助保持构图稳定。" : "这次没有强制沿用原有随机种子，因此画面可能会有更明显的变化。",
    `本轮重点修改的是：${input.originalPrompt}。`,
    "后端会保存最终使用的提示词，方便你继续追图或复现。",
  ].join("");
}
