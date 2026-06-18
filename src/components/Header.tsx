import { Zap } from "lucide-react";

interface HeaderProps {
  fileName?: string | null;
}

export function Header({ fileName }: HeaderProps) {
  return (
    <header className="surface flex h-14 items-center justify-between border-b border-border px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
          <Zap className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight">Localizador de Postes em PDF</h1>
          <p className="text-xs text-muted-foreground">Engenharia &amp; Fiscalização</p>
        </div>
      </div>
      {fileName && (
        <div className="hidden truncate text-xs text-muted-foreground md:block">
          <span className="font-medium text-foreground">Arquivo:</span> {fileName}
        </div>
      )}
    </header>
  );
}
