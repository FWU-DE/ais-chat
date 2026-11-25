import { Card, CardContent } from '@ui/components/card';

export function CustomChatAuthorInfo({
  authorLabel,
  authorText,
}: {
  authorLabel: string;
  authorText: string;
}) {
  return (
    <Card className="w-full">
      <CardContent className="flex flex-col items-center">
        <div className="text-sm text-foreground/60">{authorLabel}</div>
        <div className="text-base font-medium">{authorText}</div>
      </CardContent>
    </Card>
  );
}
