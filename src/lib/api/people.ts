import { queryOptions } from "@tanstack/react-query";
import { people, getPerson, CURRENT_USER_ID } from "@/data/people";
import { delay } from "./client";
import type { Person } from "@/types";

export { CURRENT_USER_ID };

export async function fetchPeople(): Promise<Person[]> {
  return delay(people);
}

export async function fetchCurrentUser(): Promise<Person> {
  const person = getPerson(CURRENT_USER_ID);
  if (!person) throw new Error("Current user not found");
  return delay(person);
}

export const peopleQueryOptions = () =>
  queryOptions({ queryKey: ["people"], queryFn: fetchPeople, staleTime: 5 * 60 * 1000 });

export const currentUserQueryOptions = () =>
  queryOptions({ queryKey: ["people", "me"], queryFn: fetchCurrentUser, staleTime: 5 * 60 * 1000 });
