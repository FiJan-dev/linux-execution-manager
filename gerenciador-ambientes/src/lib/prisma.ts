//conexão única com o banco, usada por todas as rotas da API
import { PrismaClient } from "@prisma/client";

//guarda a conexão num lugar global para o modo de desenvolvimento não abrir uma conexão nova a cada vez que o Next recarrega o código
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

//usa a conexão que já existe; se ainda não existe, cria uma
export const prisma = globalParaPrisma.prisma ?? new PrismaClient();

//em desenvolvimento, guarda a conexão para reaproveitar na próxima recarga
if (process.env.NODE_ENV !== "production") {
  globalParaPrisma.prisma = prisma;
}