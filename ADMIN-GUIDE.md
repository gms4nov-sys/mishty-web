# Mishty Web — Admin Panel Guide (Non-Coder Guide)

Yeh guide bina coding jaane bhi aap admin panel se apni website khud manage kar sakte hain.

## 1. Admin Panel Kaise Kholein

1. Apna website chalu karein (agar developer ne already hosting kar diya hai to seedha browser mein jayein).
2. Browser mein yeh URL kholein: `https://YOUR-WEBSITE.com/admin`
   - Agar local computer par chala rahe hain to: `http://localhost:4000/admin`
3. Username aur Password daal kar Login karein.
   - Pehli baar server start karte waqt agar aapne `.env` file mein `ADMIN_PASSWORD` set nahi ki thi, to server terminal/console mein ek **random password** print hoga — wahi use karein login ke liye.
   - **Pehli baar login karte hi Settings mein jaakar password zaroor badal lein** (neeche point 7 dekhein).

---

## 2. Logo Change Karna

1. Left menu mein **⚙ Settings** par click karein.
2. Sabse upar **🖼 Website Logo** section milega.
3. **"Choose a logo image"** par click karke apni logo file (PNG ya JPG) chunein.
4. **"Upload Logo"** button dabayein.
5. Bas — aapki website ke header aur footer dono jagah naya logo turant dikhne lagega.
6. Agar purana text logo wapas chahiye ho to **"Remove Logo"** button dabayein.

---

## 3. Phone Number / WhatsApp / Email / Address Change Karna

1. **⚙ Settings** → **📞 Contact Details** section mein jayein.
2. Yahan yeh sab change kar sakte hain:
   - **Phone number** — website par sabko yehi number dikhega.
   - **WhatsApp number** — agar bharenge to website par ek chhota WhatsApp chat button apne aap aa jayega (bottom-right corner). Khali chhod denge to button nahi dikhega.
   - **Email address**
   - **Business hours** (jaise "Mon – Sat, 10:00 AM – 7:00 PM")
   - **Address**
3. **"Save Contact Details"** button dabayein.
4. Yeh sab jagah apne aap update ho jayega — top bar, footer, aur Contact page — kahin bhi HTML file kholne ki zaroorat nahi.

---

## 4. Gallery Mein Image Upload Karna (Portfolio / Projects)

1. Left menu mein **🖼 Gallery** par click karein.
2. Naya project add karne ke liye **"+ Add Project"** button dabayein.
   - Purana project edit karna ho to us row ke saamne **"Edit"** dabayein.
3. Form mein:
   - **Project image** — yahan se apne computer se koi bhi photo/screenshot upload karein (max 5MB).
   - **Category key** — jaise `travel`, `brand`, `recruitment`, `manufacturing` (filter button ke liye).
   - **Category label** — jaise "Travel & Booking" (visitors ko yeh dikhega).
   - **Project title** aur **Description** bharein.
4. **"Add Project"** ya **"Save Changes"** dabayein.
5. Website ke Gallery page par yeh naya project/image turant dikhne lagega.
6. Kisi project ko hatana ho to us row ke saamne **"Delete"** dabayein.

---

## 5. Services Manage Karna (Service Catalog: Category → Technology → Package)

Poori website — Homepage ka "What we do" section, Services page, Catalog page, aur Enquiry form — sab ek hi jagah se control hote hain: **🗂 Services (Catalog)**. Yeh 3-level structure hai:

- **Category** — jaise "Website Development", "SEO Services", "Digital Marketing". Yeh Homepage aur Services page par bade card ki tarah dikhti hai.
- **Technology** — har category ke andar sub-services, jaise Website Development ke andar "WordPress Website", "Shopify Store", "Custom Coding Website".
- **Package** — har technology ke 3 pricing tiers: Basic / Business / Premium, apne price aur features ke saath.

**Category add/edit karna:**
1. Left menu mein **🗂 Services (Catalog)** par click karein.
2. **"+ Add Category"** se nayi category banayein, ya existing ke saamne **"Edit"** dabayein.
3. Name, ek emoji icon (jaise 🌐 🛒 📈), aur short description bharein.

**Technology add/edit karna:**
1. Kisi category ke andar **"Manage Technologies"** ya uske count par click karein.
2. **"+ Add Technology"** se sub-service add karein — name aur description bharein.

**Package add/edit karna:**
1. Kisi technology ke andar jaake **Basic / Business / Premium** package edit karein.
2. Price, price suffix (jaise "/one-time" ya "/month"), aur features list (har feature nayi line mein) bharein.

Yeh saara data website par live turant reflect hota hai — Homepage, Services page, Catalog page, sab jagah ek hi jagah se update hota hai, alag-alag jagah manage karne ki zaroorat nahi.

---

## 6. Payment Details Manage Karna

1. **⚙ Settings** → **💳 Payment Details** section mein jayein.
2. Yahan bhar sakte hain:
   - **UPI ID**
   - **Bank name, Account holder name, Account number, IFSC code**
   - **Payment note** — koi bhi extra instruction clients ke liye.
3. Neeche **QR code image** bhi upload kar sakte hain (jaise apna UPI QR code).
4. Jo bhi field bharenge sirf wahi Contact page par dikhega — khali field automatically hide ho jayega.
5. Yeh Razorpay/PayU jaisa "online payment gateway checkout" nahi hai — yeh sirf aapki payment details clients ko dikhane ke liye hai (UPI/bank transfer/QR se payment lene ke liye). Agar future mein card/UPI se seedha online payment chahiye ho to woh ek alag setup hoga — abhi ke liye yeh saare manual payment options ke liye best tareeka hai.

---

## 7. Legal Pages (Privacy Policy, Terms, Refund Policy, Disclaimer)

Website mein 4 zaroori pages already ban chuke hain:
- **Privacy Policy**
- **Terms & Conditions**
- **Payment & Refund Policy**
- **Disclaimer**

Inhe edit karne ke liye:

1. Left menu mein **📄 Legal Pages** par click karein.
2. Jo page edit karna hai uske saamne **"Edit"** dabayein.
3. Title aur content change kar sakte hain — content sirf plain text hai, koi coding/HTML nahi chahiye. Do lines ke beech ek **khali line** chhodne se naya paragraph ban jaata hai.
4. Neeche checkbox se decide kar sakte hain ki yeh page website ke footer mein link ke roop mein dikhe ya nahi.
5. **"Save Changes"** dabate hi website par turant update ho jaayega.

**Naya page add karna:** Agar koi aur page chahiye (jaise "Shipping Policy" ya "Cancellation Policy"), to **"+ Add Page"** dabayein, title aur content bharein, aur save karein. Yeh apne aap website ke footer mein link ke saath dikhega.

---

## 8. Password Change Karna

1. **⚙ Settings** → sabse neeche **🔒 Change Admin Password**.
2. Current password aur naya password bharein (kam se kam 6 characters).
3. **"Update Password"** dabayein.

---

## 9. Blog Posts Aur Messages

- **📝 Blog** — naya blog post add/edit/publish-unpublish kar sakte hain. Ab har post ka apna **full page** hai — "Excerpt" list mein short summary ke liye hai, aur "Full post content" us post ke apne page (`blog-detail.html`) par poora article dikhata hai. Do lines ke beech khali line chhodne se naya paragraph banta hai.
- **✉ Messages** — Contact form, Free SEO Audit, aur Free Demo Request — teeno se aaye hue saare enquiries yahan ek hi jagah dikhengi. Padhne ke baad "Read" mark ho jaata hai.

---

## 10. Testimonials (Client Reviews)

1. Left menu mein **⭐ Testimonials** par click karein.
2. **"+ Add Testimonial"** se naya client review add karein — client ka naam, role/company, quote, aur rating (1-5 stars) bharein. Photo optional hai (na daalne par client ke naam ka pehla letter dikhega).
3. Yeh homepage par apne aap ek dedicated section mein dikhega.

---

## 11. Client Logos ("Trusted By" Strip)

1. Left menu mein **🏢 Client Logos** par click karein.
2. Client ka naam aur logo image upload karein.
3. Yeh homepage ke "Trusted by" section mein apne aap dikhega — jitne bhi logo upload karenge sab dikhenge.

---

## 12. Social Media Icons & Homepage Trust Stats

**⚙ Settings** page ke neeche ek naya **🔗 Social Media & Trust Stats** section hai:
- Facebook, Instagram, LinkedIn, Twitter, YouTube ke links dalein — yeh footer mein chhote icons ki tarah dikhenge har page par. Khali chhodne par woh icon simply nahi dikhega.
- 4 "Trust Stats" (jaise "50+ Projects Delivered", "5+ Years Experience") edit kar sakte hain — yeh homepage ke top par highlight numbers ki tarah dikhte hain.

---

## 13. Har Service Ka Apna Alag Page

Har **Category** ka apna page hai (`/services/category-slug`) jismein uski saari **Technologies** list hoti hain, aur har **Technology** ka apna page (`/services/category-slug/technology-slug`) jismein uske **Basic / Business / Premium** packages price ke saath dikhte hain. Visitor kisi package par "Get Started" dabayega to seedha Enquiry form par pahunchega, jahan wahi category/technology/package details pre-filled honge.

Yeh sab automatic hai — jab bhi aap Section 5 mein koi Category, Technology, ya Package add/edit karte hain, yeh pages apne aap ban jaate hain, alag se koi page banane ki zaroorat nahi.

---

## Zaroori Baatein

- Har change **save button dabate hi turant live** ho jaata hai — koi extra "publish" step nahi hai.
- Images ka size **5MB se kam** rakhein, warna upload fail ho jayega.
- Agar galti se kuch delete ho jaye to woh wapas nahi aayega (koi undo nahi hai) — isliye delete se pehle confirm popup zaroor padhein.
- Website ka technical setup (server chalu karna, domain jodna, hosting) developer/technical person hi karega — yeh guide sirf **content update** (logo, contact info, gallery, services, payment info, legal pages, blog, testimonials, client logos) ke liye hai.
