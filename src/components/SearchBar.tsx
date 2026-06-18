import { Search, X } from "lucide-react";
import { useState, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";

interface SearchBarProps {
  onSearch: (query: string) => void;
  disabled?: boolean;
}

export function SearchBar({ onSearch, disabled }: SearchBarProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    onSearch(value);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div className="flex items-center gap-2">
      <div className="surface relative flex flex-1 items-center rounded-lg border border-border focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
        <Search className="ml-3 h-4 w-4 text-muted-foreground" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKey}
          disabled={disabled}
          inputMode="numeric"
          placeholder="Digite o número do poste..."
          className="h-10 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        {value && (
          <button
            onClick={() => { setValue(""); }}
            className="mr-2 rounded p-1 text-muted-foreground hover:bg-secondary"
            aria-label="Limpar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Button onClick={submit} disabled={disabled || !value.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
        Localizar
      </Button>
    </div>
  );
}
