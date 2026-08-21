import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "./http";
import { CURRENT_USER_ID, getPerson } from "@/lib/session";
import type { Person } from "@/types";

export { CURRENT_USER_ID };

export async function fetchPeople(): Promise<Person[]> {
  const { people: items } = await apiRequest<{ people: Person[] }>("/api/people");
  return items;
}

export async function fetchCurrentUser(): Promise<Person> {
  const person = getPerson(CURRENT_USER_ID);
  if (person) return person;
  // Session bootstrap already fetched the org's people list, so this should
  // always resolve from cache; fall back to a fresh fetch defensively.
  const items = await fetchPeople();
  const found = items.find((p) => p.id === CURRENT_USER_ID);
  if (!found) throw new Error("Current user not found");
  return found;
}

export const peopleQueryOptions = () =>
  queryOptions({ queryKey: ["people"], queryFn: fetchPeople, staleTime: 5 * 60 * 1000 });

export const currentUserQueryOptions = () =>
  queryOptions({ queryKey: ["people", "me"], queryFn: fetchCurrentUser, staleTime: 5 * 60 * 1000 });
