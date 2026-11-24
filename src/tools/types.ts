import { FunctionDeclaration, SchemaType } from '@google/generative-ai';
import { ToolContext } from '../types/index.js';

export interface AgentTool {
  declaration: FunctionDeclaration;
  execute: (args: any, context: ToolContext) => Promise<any>;
}
