import { NextResponse } from "next/server";

//resposta de erro no formato que o front espera: { "erro": "mensagem" }
export function erro(mensagem: string, status: number) {
  return NextResponse.json({ erro: mensagem }, { status });
}