import { FormAmbiente } from "@/components/FormAmbiente";

export default function NovoAmbiente() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Novo ambiente</h1>
          <p className="sub">Defina os recursos e o que será executado dentro do namespace.</p>
        </div>
      </div>
      <FormAmbiente />
    </>
  );
}
