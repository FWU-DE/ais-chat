CREATE TABLE "url_preset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"order_number" integer DEFAULT 0 NOT NULL,
	"urls" text[] NOT NULL
);--> statement-breakpoint

INSERT INTO url_preset (name, order_number, urls) VALUES
('Nachrichten & Presse', 1, ARRAY['tagesschau.de', 'ard.de', 'zdfheute.de', 'dw.com', 'presseportal.de']),
('Kindgerechte Nachrichten', 2, ARRAY['logo.de', 'nachrichtenleicht.de']),
('Lexika & Nachschlagewerke für Kinder', 3, ARRAY['helles-koepfchen.de', 'hanisauland.de', 'klexikon.zum.de']),
('Bildungsportale', 4, ARRAY['bildungsserver.de', 'internet-abc.de/kinder/hobby-freizeit', 'mundo.schule', 'wirlernenonline.de', 'unterrichten.zum.de', 'bpb.de', 'kinderweltreise.de', 'zeitklicks.de', 'bildungsserver.de']),
('Behörden und Politik', 5, ARRAY['bundesregierung.de', 'kuppelkucker.de', 'bpb.de', 'bundeswahlleiterin.de', 'europa.eu', 'commission.europa.eu', 'european-union.europa.eu', 'bund.de']),
('Wissenschaft & Forschung', 6, ARRAY['fraunhofer.de', 'helmholtz.de', 'helmholtz.de/transfer/schuelerlabore', 'max-wissen.de', 'dlr.de']),
('Englischsprachige Presse', 7, ARRAY['bbc.com', 'reuters.com', 'apnews.com', 'aljazeera.com', 'channelnewsasia.com', 'scmp.com']),
('eng. kindgerecht', 8, ARRAY['dogonews.com', 'newsforkids.net']),
('Französischsprachige Presse', 9, ARRAY['tv5monde.com', 'rfi.fr', 'ledevoir.com', 'jeuneafrique.com']);

