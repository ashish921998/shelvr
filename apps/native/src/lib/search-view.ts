import { t } from "@/lib/i18n";

type SearchQueryState<T> = {
  data: T[] | undefined;
  isPlaceholderData: boolean;
  isError: boolean;
};

type SearchView<T> =
  | { kind: "message"; title: string; message: string }
  | { kind: "results"; items: T[] };

/** What the Search tab shows; the last query's results stay up while the next one loads. */
export function searchView<T>(
  query: string,
  state: SearchQueryState<T>,
): SearchView<T> {
  if (query.length === 0) {
    return {
      kind: "message",
      title: t("search.emptyTitle"),
      message: t("search.emptyBody"),
    };
  }
  if (state.isError && state.data === undefined) {
    return {
      kind: "message",
      title: t("errors.searchTitle"),
      message: t("errors.connection"),
    };
  }
  if (state.data?.length === 0 && !state.isPlaceholderData) {
    return {
      kind: "message",
      title: t("search.noResultsTitle"),
      message: t("search.noResults", { query }),
    };
  }
  return { kind: "results", items: state.data ?? [] };
}
