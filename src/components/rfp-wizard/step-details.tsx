import type { UseFormReturn } from "react-hook-form";
import { StickySummary } from "@/components/common/sticky-summary";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { people } from "@/lib/session";
import { formatDateLabel, formatINR, type DetailsValues } from "./types";

function Required() {
  return (
    <span className="text-danger" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

export function StepDetails({ form }: { form: UseFormReturn<DetailsValues> }) {
  const values = form.watch();

  return (
    <Form {...form}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="surface-panel space-y-4 p-5">
          <h2 className="text-sm font-semibold text-foreground">Basic information</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>
                    RFP Name
                    <Required />
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Enterprise Platform RFP" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="customer"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Customer
                    <Required />
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. ABC Corporation" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="opportunity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opportunity</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Enterprise Platform Expansion" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="ownerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    RFP Owner
                    <Required />
                  </FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {p.role}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="deadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Submission Deadline
                    <Required />
                  </FormLabel>
                  <FormControl>
                    <Input type="date" min={new Date().toISOString().slice(0, 10)} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="estimatedValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estimated Contract Value</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} step={10000} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <StickySummary>
          <div>
            <h2 className="text-sm font-semibold text-foreground">RFP summary</h2>
            <p className="mt-1 text-xs text-muted-foreground">Preview of what will be created.</p>
          </div>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="truncate text-right font-medium text-foreground">
                {values.title || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="truncate text-right font-medium text-foreground">
                {values.customer || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Opportunity</dt>
              <dd className="truncate text-right font-medium text-foreground">
                {values.opportunity || "—"}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Deadline</dt>
              <dd className="num text-right font-medium text-foreground">
                {formatDateLabel(values.deadline)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Est. value</dt>
              <dd className="num text-right font-medium text-foreground">
                {formatINR(Number(values.estimatedValue) || 0)}
              </dd>
            </div>
          </dl>
        </StickySummary>
      </div>
    </Form>
  );
}
