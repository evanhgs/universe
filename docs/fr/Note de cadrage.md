# **Note de cadrage – Plateforme de marketplace musicale**

## **1\. Contexte et problématique**

Le marché des instrumentales et services liés au beatmaking/ingénierie sonore est fragmenté. Les plateformes existantes ne couvrent pas simultanément :

* la vente d’instrumentales,  
* la gestion des droits (édition, sociétés d’auteurs),  
* la communication entre artistes,  
* la découverte de contenus modernes (formats courts type TikTok).

Les créateurs font face à :

* une complexité administrative (SACEM, contrats),  
* une difficulté à se démarquer,  
* des barrières linguistiques à l’international.  
* des prix trop élevés

Objectif : créer une plateforme centralisée simplifiant la **vente, la collaboration et la gestion des droits musicaux**.

---

## **2\. Objectifs du projet**

### **Objectif principal**

Développer une marketplace spécialisée permettant :

* la vente d’instrumentales,  
* la mise en relation artistes / ingénieurs du son,  
* la gestion simplifiée des droits et contrats.

### **Objectifs secondaires**

* Améliorer la découvrabilité des contenus (format court type réseaux sociaux).  
* Faciliter les échanges internationaux (chat \+ traduction).  
* Offrir des outils professionnels aux créateurs (statistiques, contrats, publication).

---

## **3\. Périmètre fonctionnel**

### **3.1 Fonctionnalités cœur (MVP)**

* Marketplace d’instrumentales  
* Création de comptes utilisateurs (authentification)  
* Profils utilisateurs (vendeur / acheteur)  
* Système de paiement (CB, PayPal, Stripe, MasterCard)  
* Publication d’instrumentales  
* Système de commission (≈30%)  
* Chat entre utilisateurs traduit automatiquement

---

### **3.2 Fonctionnalités avancées (moins prioritaires)**

#### **Découverte & UX**

* Feed vidéo type TikTok / Shorts pour les instrumentales  
* Mise en avant des 3 premières publications  
* Algorithme de scoring (visibilité, qualité, engagement)

#### **Monétisation & business model**

* Vente gratuite avec restrictions (branding obligatoire, commission élevée)  
* Abonnement premium :  
  * suppression des restrictions  
  * personnalisation du profil  
  * meilleure visibilité  
* Classement des vendeurs :  
  * organique (performance)  
  * promotionnel (payant)

#### **Outils créateurs**

* Création de miniatures (type Canva)  
* Statistiques détaillées :  
  * écoutes  
  * ventes  
  * followers  
* Dashboard vendeur

#### **Communication**

* Chat intégré  
* Traduction automatique des conversations (rétention utilisateur)

---

### **3.3 Gestion des droits & juridique**

* Intégration des sociétés de droits d’auteur :  
  * SACEM  
  * ASCAP ( usa )  
  * SGAE ( espagne )  
  * PRS for Music ( angleterre )  
* Génération de contrats directement sur la plateforme  
* Signature numérique  
* Système de “maison d’édition” intégré

---

### **3.4 Protection & Content ID**

* Système de détection basé IA :  
  * identification des sons sur :  
    * YouTube  
    * Spotify  
    * Deezer

Objectif : protéger les droits et détecter les usages non autorisés.

---

## **4\. Contraintes**

### **Techniques**

* Scalabilité (contenu audio \+ vidéo)  
* Temps réel (chat, traduction)  
* Intégration API paiement  
* Système d’upload performant  
* IA compliqué à dvp pour le content id

### **Légales**

* RGPD (cookies, données personnelles)  
* Vérification d’identité (KYC)  
* Gestion des droits musicaux internationaux  
* Validité juridique des contrats générés

### **Produits**

* UX ( ergonomie/user experience ) simple malgré la complexité métier  
* Fidélisation (éviter sortie vers WhatsApp/Instagram)

---

## **5\. Acteurs du projet**

* Artistes / Beatmakers (vendeurs)  
* Acheteurs (rappeurs, créateurs)  
* Ingénieurs du son (prestataires)  
* Plateforme (opérateur)

---

## **6\. Modèle économique**

* Commission sur ventes (\~30% pour le service gratuit/ 12/15%)  
* Abonnements premium (4.99€ \-\> 8.99€)  
* Mise en avant payante (ranking sponsorisé)  
* Services additionnels (contrats, visibilité)

---

## **7\. Indicateurs de succès (KPIs)**

* Nombre d’utilisateurs actifs  
* Volume de transactions  
* Taux de conversion (écoute → achat)  
* Rétention utilisateur  
* Nombre de contenus publiés  
* Revenus générés

---

## **8\. Risques identifiés**

* Complexité juridique (droits musicaux)  
* Concurrence (BeatStars, Airbit…)  
* Fraude / plagiat  
* Adoption initiale (cold start marketplace)  
* Coût infra (stockage audio/vidéo)

---

## **9\. Roadmap indicative**

### **Phase 1 (MVP)**

* Marketplace \+ paiement \+ upload  
* Comptes utilisateurs  
* Chat simple

### **Phase 2**

* Feed type TikTok  
* Algorithme de scoring  
* Statistiques

### **Phase 3**

* Contrats automatisés  
* Intégration sociétés d’auteurs  
* Traduction chat

### **Phase 4**

* Content ID (IA)  
* Features avancées (éditeur, branding, etc.)

---

## **10\. Points à clarifier**

* Nom de la plateforme  
* Positionnement exact (premium vs accessible)  
* Niveau de complexité juridique au lancement  
* Stratégie d’acquisition (créateurs vs acheteurs)  
  