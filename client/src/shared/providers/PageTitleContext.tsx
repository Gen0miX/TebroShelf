import { createContext, useContext } from "react";

export const PageTitleContext = createContext<(title: string) => void>(
  () => {},
);

export const usePageTitle = () => useContext(PageTitleContext);
