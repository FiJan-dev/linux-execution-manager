import { DetalheAmbiente } from "@/components/DetalheAmbiente";

export default async function PaginaAmbiente({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DetalheAmbiente id={id} />;
}
