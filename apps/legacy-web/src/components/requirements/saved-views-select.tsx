import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SAVED_VIEWS } from "./requirement-filters";

export function SavedViewsSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full sm:w-44" aria-label="Saved view">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SAVED_VIEWS.map((view) => (
          <SelectItem key={view.id} value={view.id}>
            {view.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
