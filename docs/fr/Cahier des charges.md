# **Cahier des charges – Plateforme marketplace musicale**

## **1\. Objet du document**

Ce document définit :

* les fonctionnalités attendues,  
* les contraintes techniques et légales,  
* les règles de fonctionnement produit,  
* les livrables attendus du développeur.

Il sert de référence contractuelle entre les parties.

---

## **2\. Présentation du projet**

### **2.1 Description**

Plateforme web permettant :

* la vente d’instrumentales,  
* la mise en relation avec des ingénieurs du son et client,  
* la gestion simplifiée des droits musicaux signés en contrats sacem/edition facilement,  
* tiktokisation  
* algo de mise en valeur (kpis valeur taux de conversion)   
* plateforme crawler pour la recherche d’instru utilisé du gars,  
* publication d’instru gratuit sous condition (voir note de cadrage)  
* abonnement mensuel/annuel avec moins de frais (voir note de cadrage)

### **2.2 Cibles**

* Beatmakers / producteurs  
* Artistes (rappeurs, chanteurs, créateurs)  
* Ingénieurs du son

---

## **3\. Périmètre fonctionnel**

### **3.1 Gestion des utilisateurs**

#### **Fonctionnalités attendues**

* Création de compte (email \+ mot de passe \+ nom \+ prénom \+ numéro tel \[verif a2f\] )  
* Connexion / déconnexion  
* Récupération de mot de passe  
* Suppression du compte  
* Gestion des informations personnelles (cookies)

#### **Vérification d’identité**

* Upload de documents  
* Validation manuelle ou automatique (know your customers)  
* Statut utilisateur (vérifié / non vérifié)   
* Adresse

---

### **3.2 Profils utilisateurs**

* Note sur 5 : critères   
  * communication   
  * délai de réponse (réactivité)  
  * qualité distribuée   
* Page profil publique :  
  * photo / bannière  
  * description  
  * catalogue d’instrumentales  
* Affichage :  
  * nombre d’écoutes  
  * ventes  
  * followers  
  * Avis

---

### **3.3 Marketplace**

#### **Publication**

* Upload audio :   
  * Sans licence (.mp3 only)   
  * Avec licence (.wave, .rar \+ .mp3)  
* Ajout :  
  * titre  
  * description  
  * prix  
* Ajout obligatoire d’une miniature (créée sur plateforme ou uploadée)

#### **Vente**

* Achat via :  
  * carte bancaire  
  * PayPal  
* Gestion des licences (personnalisable par le vendeur)  
* Commission plateforme 30% et avec abonnement à 9%

#### **Restrictions (offre gratuite)**

* Branding obligatoire (logo plateforme)

---

### **3.4 Système de contenu (découverte)**

* Feed type TikTok :  
  * scroll vertical  
  * lecture automatique  
* Mise en avant :  
  * 3 premières publications boostées  
* Algorithme découverte de scoring basé sur :  
  * style d’instru (rnb…)  
  * nom de l’instru  
  * nom de l’artiste (mot clé)  
  * ce que l’utilisateur aimerait bien (similaire)  
  * randomisation (param à dev)  
* Algorithme personnalisé (fyp) basé sur :   
  * engagement  
  * ventes réussies  
  * qualité du taux de conversion ventes/vues)  
  * abonnement  
  * notes attribuées

---

### **3.5 Système de classement au mérite** 

* Classement organique (performance)

---

### **3.6 Communication**

* Chat interne :  
  * messages texte  
  * historique des conversations  
* Traduction automatique :  
  * détection de langue  
  * traduction en temps réel

Objectif : éviter l’utilisation d’outils externes.

---

### **3.7 Outils créateurs**

#### **Dashboard vendeur**

* Statistiques :  
  * ventes  
  * écoutes  
  * revenus  
* Gestion des publications  
* Paramétrage des prix  
* Paramétrage licences ( à bien expliqué aux vendeurs )  
* Code promo ( 1 achetée 1 offerte, réduction )

#### **Création de miniature**

* Éditeur intégré (type Canva simplifié)

---

### **3.8 Gestion des contrats et droits**

#### **Génération de contrats**

* Contrats générés automatiquement lors de la vente  
* Personnalisation selon type de licence

#### **Intégration organismes**

* SACEM  
* ASCAP  
* SGAE  
* PRS for Music

#### **Signature**

* Signature électronique intégrée

---

### **3.9 Content ID (phase avancée)**

* Détection automatique d’utilisation des sons  
* Scan des plateformes :  
  * YouTube  
  * Spotify  
  * Deezer

---

## **4\. Règles de gestion**

* Commission par défaut : 30%  
* 3 premières publications boostées automatiquement  
* Vente gratuite avec restrictions  
* Abonnement premium :  
  * suppression restrictions  
  * accès fonctionnalités avancées

---

**5\. Exigences techniques**

## **5.1 Architecture**

### **Frontend**

* Framework : **Next.js (React \+ TypeScript+Tailwindcss)**  
* Architecture :  
  * App Router (Server / Client Components)  
  * Rendu hybride (SSR / CSR / ISR selon les pages)  
* Objectifs :  
  * performance sur pages publiques (profils, catalogue)  
  * interactivité côté client (feed, dashboard, chat)  
* Gestion d’état :  
  * tanstack query et optimisation  
* UI :  
  * pc-first puis mobile très important  
  * optimisation du scroll (feed type TikTok)  
  * un ux très intuitif et simple  
  * Apple design Web (Font+UI kit+iOS 26\)

---

### **Backend (core applicatif)**

* Technologie : Nextjs (fetch donnée interactivité data) \+ Fastapi (score maths \+ ia ) \+ Axum (traitement musique lourd)  
* Rôle :  
  * logique métier principale  
  * gestion utilisateurs, auth, paiement, licences  
  * orchestration des services (Rust / Python)  
* Architecture :  
  * Modulaire et scalable pour l’avenir, le core Nextjs et des services à coté pour séparer les taches complexes, mono repo avec séparation claire des taches et bien nommée

---

### **Services spécialisés**

#### **Workers Rust**

* Rôle :  
  * traitement audio (conversion, normalisation)  
  * génération de previews audio  
  * extraction de features audio (fingerprinting)  
* Exécution :  
  * jobs asynchrones (queue)  
  * isolés du backend principal

#### **Services Pyth on**

* Rôle :  
  * algorithmes de recommandation  
  * scoring utilisateurs / contenu  
  * traduction  
  * base pour futur Content ID

---

### **Communication inter-services**

* HTTP interne ou (gRPC → mieux)  
* Queue de jobs avec Redis

---

### **Base de données**

* **PostgreSQL (principal)**  
  * gestion transactions (paiement)  
  * relations complexes (utilisateurs, ventes, licences)  
* **Redis (complément)**  
  * cache  
  * sessions  
  * file de jobs  
  * optimisation feed / ranking

---

## **5.2 Infrastructure**

### **Hébergement** (Il sera selfhost dans un premier temps)

* Déploiement via **Docker**   
* Puis scale et déploiement sur serveur AWS ou Hostinger à voir les meilleurs plus tard…

---

### **Stockage**

* Stockage objet (type S3 compatible)  
  * fichiers audio (.mp3, .wav, .rar)  
  * images / miniatures  
* CDN pour distribution rapide

---

### **Streaming audio**

* Génération de previews audio (30–60s)  
* Streaming optimisé (progressif ou HLS)  
* Réduction de la taille des fichiers côté client

---

### **Scalabilité**

* Scalabilité horizontale :  
  * instances backend multiples  
  * cache Redis partagé  
* séparation des responsabilités :  
  * frontend / backend / workers  
* traitement asynchrone pour tâches lourdes

---

## **5.3 API**

### **Type d’API**

* **REST (prioritaire pour MVP)**  
* GraphQL (optionnel, phase avancée)

---

### **Sécurité**

* Authentification :  
  * JWT (access \+ refresh tokens)  
  * 2FA (SMS ou email)  
* Autorisation :  
  * rôles (inconnu(visiteur) /vendeur / acheteur / admin)  
* Protection :  
  * rate limiting  
  * validation des entrées

---

### **Temps réel**

* WebSocket (chat)  
* Redis Pub/Sub (scalabilité)

---

## **5.4 Paiement**

### **Intégration**

* **Stripe (principal)**  
* PayPal (complément)

---

### **Fonctionnalités**

* gestion des transactions  
* split paiement (commission plateforme)  
* gestion abonnements :  
  * mensuel / annuel  
  * réduction commission (30% → 9%)

---

### **Historique**

* stockage complet :  
  * achats  
  * ventes  
  * commissions  
* export possible (comptabilité)

---

## **5.5 Gestion des tâches asynchrones**

* Système de queue :  
  * Redis  
* Cas d’usage :  
  * traitement audio  
  * génération previews  
  * envoi emails  
  * calcul scoring  
  * tâches Content ID futures

---

## **5.6 Observabilité & maintenance**

* Logs centralisés  
* Monitoring (CPU, mémoire, erreurs)  
* alertes en cas de panne  
* versioning API

---

## **5.7 Sécurité avancée**

* chiffrement données sensibles  
* protection upload (scan fichiers)  
* prévention fraude (paiement, comptes)  
* conformité RGPD :  
  * suppression données  
  * gestion consentement cookies

---

## **6\. Exigences légales**

* Conformité RGPD :  
  * gestion des cookies  
  * droit à l’oubli  
* KYC (vérification identité) (stocké en France obligatoirement)  
* Gestion des droits musicaux  
* Validité des contrats générés

---

## **7\. UX / UI**

* Interface intuitive  
* Navigation rapide  
* Expérience mobile-first  
* Inspiration :  
  * TikTok (feed)  
  * Canva (édition)

---

## **8\. Sécurité**

* Chiffrement des données sensibles  
* Protection contre fraude  
* Sécurisation paiements  
* Protection contre upload malveillant