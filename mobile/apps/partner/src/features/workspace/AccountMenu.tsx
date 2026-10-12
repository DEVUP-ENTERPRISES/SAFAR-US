import { useRouter } from 'expo-router';
import { Bell, BookOpen, FileText, HelpCircle, LifeBuoy, LogOut, Mail, Repeat, ShieldCheck, Trash2 } from 'lucide-react-native';
import { MenuRow, MenuSection, Text, useTheme } from '@catodrive/ui';
import { appInfo, openInAppBrowser, useSignOut, webUrl } from '@catodrive/core';
import { usePlatformConfig } from '@catodrive/core/web/features/platform/config';
import { WORKSPACE_HOME, WORKSPACE_LABEL, useWorkspaceChoice, useWorkspaces, type Workspace } from './workspaces';

/** The part of every workspace's menu that is about the account: switch, notifications, help, legal, sign out, delete. */
export function AccountMenu({ current }: { current: Workspace }) {
  const { c } = useTheme();
  const router = useRouter();
  const cfg = usePlatformConfig().data;
  const { available } = useWorkspaces();
  const choose = useWorkspaceChoice((s) => s.set);
  const { signOut, pending } = useSignOut('/login');
  const icon = (I: React.ComponentType<{ size?: number; color?: string }>) => <I size={20} color={c.mutedForeground} />;
  const others = available.filter((w) => w !== current);

  return (
    <>
      {others.length ? (
        <MenuSection title="Switch workspace">
          {others.map((w) => (
            <MenuRow
              key={w}
              icon={icon(Repeat)}
              label={`${WORKSPACE_LABEL[w]} workspace`}
              onPress={() => {
                choose(w);
                router.replace(WORKSPACE_HOME[w] as never);
              }}
            />
          ))}
        </MenuSection>
      ) : null}
      <MenuSection title="Account">
        <MenuRow icon={icon(Bell)} label="Notifications" onPress={() => router.push('/account/notifications')} />
      </MenuSection>
      <MenuSection title="Help">
        <MenuRow icon={icon(HelpCircle)} label="Help centre" onPress={() => router.push('/help')} />
        <MenuRow icon={icon(LifeBuoy)} label="Support" onPress={() => router.push('/support')} />
        <MenuRow icon={icon(Mail)} label="Contact us" onPress={() => router.push('/contact')} />
      </MenuSection>
      <MenuSection title="Legal">
        <MenuRow icon={icon(FileText)} label="Terms of Service" onPress={() => void openInAppBrowser(cfg?.legal?.termsUrl || webUrl('/terms'))} />
        <MenuRow icon={icon(ShieldCheck)} label="Privacy Policy" onPress={() => void openInAppBrowser(cfg?.legal?.privacyUrl || webUrl('/privacy'))} />
        <MenuRow icon={icon(BookOpen)} label="All policies" onPress={() => void openInAppBrowser(webUrl('/legal'))} />
      </MenuSection>
      <MenuSection>
        <MenuRow icon={<LogOut size={20} color={c.foreground} />} label={pending ? 'Signing out…' : 'Sign out'} onPress={() => void signOut()} />
        <MenuRow icon={<Trash2 size={20} color={c.destructive} />} label="Delete account" destructive onPress={() => router.push('/account/delete')} />
      </MenuSection>
      <Text variant="caption" tone="muted" center>CatoDrive Partner {appInfo.version}</Text>
    </>
  );
}
