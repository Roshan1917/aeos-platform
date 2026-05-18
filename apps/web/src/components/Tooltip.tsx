import * as RT from '@radix-ui/react-tooltip';

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <RT.Provider delayDuration={150}>
      <RT.Root>
        <RT.Trigger asChild>{children}</RT.Trigger>
        <RT.Portal>
          <RT.Content
            side={side}
            align={align}
            sideOffset={6}
            className="z-50 max-w-xs rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          >
            {content}
            <RT.Arrow className="fill-gray-900" />
          </RT.Content>
        </RT.Portal>
      </RT.Root>
    </RT.Provider>
  );
}
