export interface ProgramNode {
  type: "Program";
  statements: StatementNode[];
}

export type StatementNode =
  | FunctionDefNode
  | AssignmentNode
  | OutputNode
  | ProcessNode
  | ExpressionStatementNode
  | RouteNode;

export interface FunctionDefNode {
  type: "FunctionDef";
  name: string;
  params: string[];
  body: ExpressionNode;
}

export interface AssignmentNode {
  type: "Assignment";
  target: IdentifierNode;
  operator: string;
  value: ExpressionNode;
}

export interface OutputNode {
  type: "Output";
  label?: string;
  value: ExpressionNode;
}

export interface ProcessNode {
  type: "Process";
  steps: ExpressionNode[];
  operators: string[];
}

export interface ExpressionStatementNode {
  type: "ExpressionStatement";
  expression: ExpressionNode;
}

export interface RouteNode {
  type: "Route";
  method: string;
  path: string;
  handler: ExpressionNode;
}

export type ExpressionNode =
  | NumberLiteralNode
  | StringLiteralNode
  | IdentifierNode
  | BinaryNode
  | UnaryNode
  | CallNode
  | ObjectLiteralNode
  | ArrayLiteralNode;

export interface NumberLiteralNode {
  type: "NumberLiteral";
  value: number;
  unit?: string;
}

export interface StringLiteralNode {
  type: "StringLiteral";
  value: string;
}

export interface IdentifierNode {
  type: "Identifier";
  name: string;
}

export interface BinaryNode {
  type: "Binary";
  operator: string;
  left: ExpressionNode;
  right: ExpressionNode;
}

export interface UnaryNode {
  type: "Unary";
  operator: string;
  operand: ExpressionNode;
}

export interface CallNode {
  type: "Call";
  callee: string;
  args: ExpressionNode[];
}

export interface ObjectLiteralNode {
  type: "ObjectLiteral";
  properties: ObjectPropertyNode[];
}

export interface ObjectPropertyNode {
  key: string;
  value: ExpressionNode;
}

export interface ArrayLiteralNode {
  type: "ArrayLiteral";
  elements: ExpressionNode[];
}
