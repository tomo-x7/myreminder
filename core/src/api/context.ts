// API クライアントを React の木で配る。クエリのフックは useApi() で受け取る(core は .tsx を持たないので createElement)
import { createContext, createElement, type ReactNode, useContext } from "react";
import type { Api } from "./client";

const ApiContext = createContext<Api | null>(null);

export function ApiProvider({ api, children }: { api: Api; children?: ReactNode }) {
	return createElement(ApiContext.Provider, { value: api }, children);
}

export function useApi(): Api {
	const api = useContext(ApiContext);
	if (!api) throw new Error("ApiProvider の中で使ってください");
	return api;
}
