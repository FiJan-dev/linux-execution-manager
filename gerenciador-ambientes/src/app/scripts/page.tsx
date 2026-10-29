import { ScriptsManager } from "@/components/ScriptsManager";

export default function PaginaScripts() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Scripts</h1>
          <p className="sub">Envie scripts uma vez e reutilize-os em qualquer ambiente.</p>
        </div>
      </div>
      <ScriptsManager />
    </>
  );
}
