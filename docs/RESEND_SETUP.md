# Resend Email Setup

Source officielle lue pour cette integration: https://resend.com/docs/send-with-nextjs

## Transactionnel maintenant

1. Creer une cle API Resend avec le droit d'envoi.
2. Verifier le domaine d'envoi dans Resend avant prod/staging.
3. Configurer les variables cote serveur:
   - `RESEND_API_KEY`
   - `RESEND_EMAIL_FROM` avec une adresse du domaine verifie, par exemple `no-reply@example.com`
4. Redemarrer le service Next.js apres changement d'environnement.
5. Tester depuis `/account-test` avec `POST /api/account-test/email`.

## TODO Broadcast Admin

- Creer un back-office admin protege par role `ADMIN`.
- Ajouter un modele de campagne email dedie avant d'envoyer quoi que ce soit.
- Gerer opt-out, unsubscribe, rate limits et logs de livraison.
- Utiliser les APIs Resend Broadcast/Audience seulement depuis une route serveur admin authentifiee.
- Ne pas reutiliser `EmailService.send()` pour du marketing: il reste reserve aux emails transactionnels.
