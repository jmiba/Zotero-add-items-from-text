// Zotero type declarations for plugin development

// Extend Window for Zotero properties
interface Window {
  ZoteroPane?: unknown;
  openDialog(url: string, name: string, features: string, ...args: unknown[]): Window;
}

// Extend Document to include Zotero-specific methods
interface Document {
  createXULElement(tagName: string): XULElement;
}

interface XULElement extends Element {
  setAttribute(name: string, value: string): void;
  style: CSSStyleDeclaration;
  appendChild(child: Node): Node;
  remove(): void;
  addEventListener(type: string, listener: EventListener): void;
}

declare const Zotero: {
  initializationPromise: Promise<void>;
  Prefs: {
    get(pref: string, global?: boolean): unknown;
    set(pref: string, value: unknown, global?: boolean): void;
    clear(pref: string, global?: boolean): void;
  };
  Promise: {
    delay(ms: number): Promise<void>;
  };
  getMainWindow(): Window;
  getMainWindows(): Window[];
  Items: {
    getAsync(ids: number | number[]): Promise<ZoteroItem | ZoteroItem[]>;
  };
  Item: new (itemType?: string) => ZoteroItem;
  ItemTypes: {
    getID(typeName: string): number;
    getName(typeID: number): string;
    getTypes(): Array<{ id: number; name: string }>;
  };
  ItemFields: {
    getID(fieldName: string): number;
    getName(fieldID: number): string;
    getFieldsForType(typeID: number): Array<{ id: number; name: string }>;
    isValidForType(fieldID: number, typeID: number): boolean;
  };
  CreatorTypes: {
    getID(typeName: string): number;
    getName(typeID: number): string;
    getTypesForItemType(typeID: number): Array<{ id: number; name: string }>;
  };
  Utilities: {
    randomString(length?: number): string;
    trimInternal(str: string): string;
    cleanDOI(doi: string): string | false;
    cleanISBN(isbn: string): string | false;
  };
  File: {
    getContentsAsync(path: string): Promise<string>;
    putContentsAsync(path: string, contents: string): Promise<void>;
  };
  HTTP: {
    request(
      method: string,
      url: string,
      options?: {
        headers?: Record<string, string>;
        body?: string;
        responseType?: string;
        timeout?: number;
        successCodes?: number[];
      }
    ): Promise<{ status: number; response: string; responseText: string }>;
  };
  debug(msg: string, level?: number): void;
  log(msg: string, type?: string): void;
  logError(e: Error | string): void;
  getActiveZoteroPane(): ZoteroPane;
  launchURL(url: string): void;
  getString(name: string, params?: string[]): string;
  hiDPI: boolean;
  isMac: boolean;
  isWin: boolean;
  isLinux: boolean;
  locale: string;
  version: string;
  platformMajorVersion: number;
};

declare interface ZoteroItem {
  id: number;
  key: string;
  libraryID: number;
  itemType: string;
  itemTypeID: number;
  dateAdded: string;
  dateModified: string;
  getField(field: string, unformatted?: boolean, includeBaseMapped?: boolean): string;
  setField(field: string, value: string | number): void;
  getCreators(): Array<{
    firstName: string;
    lastName: string;
    creatorType: string;
    creatorTypeID: number;
  }>;
  setCreators(
    creators: Array<{
      firstName?: string;
      lastName?: string;
      name?: string;
      creatorType: string;
    }>
  ): void;
  getTags(): Array<{ tag: string; type: number }>;
  setTags(tags: Array<{ tag: string; type?: number }>): void;
  addTag(tag: string, type?: number): boolean;
  removeTag(tag: string): boolean;
  getCollections(): number[];
  addToCollection(collectionID: number): void;
  removeFromCollection(collectionID: number): void;
  getAttachments(): number[];
  getNotes(): number[];
  saveTx(options?: { skipDateModifiedUpdate?: boolean }): Promise<void>;
  save(options?: { skipDateModifiedUpdate?: boolean }): Promise<void>;
  isRegularItem(): boolean;
  isAttachment(): boolean;
  isNote(): boolean;
  deleted: boolean;
  parentID: number | false;
  parentKey: string | false;
}

declare interface ZoteroPane {
  getSelectedCollection(): ZoteroCollection | null;
  getSelectedLibraryID(): number;
  getSelectedItems(): ZoteroItem[];
  itemsView: {
    selection: {
      count: number;
      currentIndex: number;
    };
  };
}

declare interface ZoteroCollection {
  id: number;
  key: string;
  libraryID: number;
  name: string;
  parentID: number | false;
  getChildItems(): ZoteroItem[];
}

declare const Services: {
  scriptloader: {
    loadSubScript(url: string, scope?: object): void;
  };
  prompt: {
    alert(window: Window | null, title: string, message: string): void;
    confirm(window: Window | null, title: string, message: string): boolean;
    prompt(
      window: Window | null,
      title: string,
      message: string,
      value: { value: string },
      checkLabel: string | null,
      check: { value: boolean }
    ): boolean;
  };
  prefs: {
    getBranch(prefix: string): {
      getCharPref(name: string): string;
      setCharPref(name: string, value: string): void;
      getIntPref(name: string): number;
      setIntPref(name: string, value: number): void;
      getBoolPref(name: string): boolean;
      setBoolPref(name: string, value: boolean): void;
      clearUserPref(name: string): void;
    };
  };
  wm: {
    getMostRecentWindow(windowType: string | null): Window | null;
    getEnumerator(windowType: string | null): { hasMoreElements(): boolean; getNext(): Window };
  };
};

declare const Cu: {
  unload(url: string): void;
  import(url: string): unknown;
};

declare const APP_SHUTDOWN: number;
