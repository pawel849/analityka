// Bezpieczny kalkulator wzorów metryk (bez eval).
// Obsługuje: liczby, zmienne, + - * / %, nawiasy, funkcje:
//   node("Nazwa węzła", "pole")  – wartość z konkretnego węzła mapy
//   edge("Węzeł A", "Węzeł B")   – liczba osób przechodzących strzałką A → B
//   min(a,b,...), max(a,b,...), round(x, miejsca)
// Dzielenie przez zero zwraca null (wyświetlane jako „—”).

export type Value = number | null;

export interface FormulaContext {
  vars: Record<string, number | null>;
  node?: (label: string, field: string) => Value;
  edge?: (from: string, to: string) => Value;
}

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const v = Number(src.slice(i, j));
      if (Number.isNaN(v)) throw new Error(`Niepoprawna liczba: ${src.slice(i, j)}`);
      out.push({ t: "num", v });
      i = j;
    } else if (c === '"' || c === "'") {
      const j = src.indexOf(c, i + 1);
      if (j < 0) throw new Error("Niezamknięty cudzysłów");
      out.push({ t: "str", v: src.slice(i + 1, j) });
      i = j + 1;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j) });
      i = j;
    } else if ("+-*/%(),".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
    } else {
      throw new Error(`Nieznany znak: ${c}`);
    }
  }
  return out;
}

type Arg = Value | string;

export function evaluate(src: string, ctx: FormulaContext): Value {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const expectOp = (v: string) => {
    if (!isOp(v)) throw new Error(`Oczekiwano „${v}”`);
    pos++;
  };
  const num = (a: Arg): Value => {
    if (typeof a === "string") throw new Error("Tekst można podać tylko jako argument node()/edge()");
    return a;
  };
  const bin = (a: Value, b: Value, f: (x: number, y: number) => Value): Value => (a == null || b == null ? null : f(a, b));

  function expr(): Arg {
    let left = term();
    while (isOp("+") || isOp("-")) {
      const op = toks[pos++].v;
      const right = term();
      left = bin(num(left), num(right), (x, y) => (op === "+" ? x + y : x - y));
    }
    return left;
  }
  function term(): Arg {
    let left = unary();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = toks[pos++].v;
      const right = unary();
      left = bin(num(left), num(right), (x, y) => {
        if (op === "*") return x * y;
        if (y === 0) return null;
        return op === "/" ? x / y : x % y;
      });
    }
    return left;
  }
  function unary(): Arg {
    if (isOp("-")) {
      pos++;
      const v = num(unary());
      return v == null ? null : -v;
    }
    if (isOp("+")) {
      pos++;
      return unary();
    }
    return primary();
  }
  function primary(): Arg {
    const tk = peek();
    if (!tk) throw new Error("Niekompletny wzór");
    if (tk.t === "num" || tk.t === "str") {
      pos++;
      return tk.v;
    }
    if (tk.t === "op" && tk.v === "(") {
      pos++;
      const v = expr();
      expectOp(")");
      return v;
    }
    if (tk.t === "id") {
      pos++;
      if (isOp("(")) {
        pos++;
        const args: Arg[] = [];
        if (!isOp(")")) {
          args.push(expr());
          while (isOp(",")) {
            pos++;
            args.push(expr());
          }
        }
        expectOp(")");
        return call(tk.v, args);
      }
      if (!(tk.v in ctx.vars)) throw new Error(`Nieznana zmienna: ${tk.v}`);
      return ctx.vars[tk.v];
    }
    throw new Error(`Nieoczekiwany symbol: ${tk.v}`);
  }
  function call(name: string, args: Arg[]): Value {
    switch (name) {
      case "node":
        if (typeof args[0] !== "string" || typeof args[1] !== "string") throw new Error('Użycie: node("Nazwa", "pole")');
        return ctx.node ? ctx.node(args[0], args[1]) : null;
      case "edge":
        if (typeof args[0] !== "string" || typeof args[1] !== "string") throw new Error('Użycie: edge("Od", "Do")');
        return ctx.edge ? ctx.edge(args[0], args[1]) : null;
      case "min":
      case "max": {
        const vs = args.map(num);
        if (vs.some((v) => v == null) || vs.length === 0) return null;
        return name === "min" ? Math.min(...(vs as number[])) : Math.max(...(vs as number[]));
      }
      case "round": {
        const v = num(args[0]);
        const d = args[1] == null ? 0 : (num(args[1]) ?? 0);
        if (v == null) return null;
        const f = 10 ** d;
        return Math.round(v * f) / f;
      }
      default:
        throw new Error(`Nieznana funkcja: ${name}`);
    }
  }

  const result = expr();
  if (pos < toks.length) throw new Error(`Nieoczekiwany symbol: ${toks[pos].v}`);
  return num(result);
}
