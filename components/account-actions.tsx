import { headers } from "next/headers";

import { GlobalLogoutButton } from "@/components/global-logout-button";
import { LogoutButton } from "@/components/logout-button";
import { auth } from "@/lib/auth/better";
import { floatctfLinkForSession } from "@/lib/auth/floatctf-logout";

/** 顶栏退出操作：经 FloatCTF 登录的会话额外提供「退出 FloatCTF 及所有应用」。 */
export async function AccountActions() {
  const current = await auth.api.getSession({ headers: await headers() }).catch(() => null);
  const linked = current?.session ? Boolean(await floatctfLinkForSession(current.session.id)) : false;
  return (
    <>
      {linked && <GlobalLogoutButton />}
      <LogoutButton />
    </>
  );
}
