"use client";

import * as React from "react";

/** 退出 LearnOS 成功后清理本机的笔记缓存（共用电脑时不残留私人笔记）。 */
export function ClearPrivateLocalData() {
  React.useEffect(() => {
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("learnos:note:")) window.localStorage.removeItem(key);
      }
    } catch {
      // Storage may be unavailable; nothing to clear.
    }
  }, []);
  return null;
}
