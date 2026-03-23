// ASTNode.js
export class ASTNode {
  constructor(value, id = null) {
    this.value = value;
    this.id = id;
    this.left = null;
    this.right = null;

    // Direct Construction attributes
    this.nullable = false;
    this.firstpos = new Set();
    this.lastpos = new Set();
  }
}
