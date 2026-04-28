# Data Parse — Deploy to Netlify

## What this is
A general-purpose AI document analyzer powered by Jessica (Claude AI). Upload any document — insurance policy, legal contract, Bill of Rights, medical record, financial statement, court ruling, scientific paper — and get a structured breakdown of document type, relevant parties, key dates, amounts, sections, rights, obligations, restrictions, definitions, and more.

---

## One-time Setup (5–10 minutes)

### Step 1 — Push to GitHub
1. Create a new repo on GitHub (github.com → New repository)
2. In your terminal, from inside the `insurance-parser` folder:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

### Step 2 — Connect to Netlify
1. Go to [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Connect to GitHub and select your repo
3. Build settings should auto-detect, but verify:
   - **Build command:** `npm run build`
   - **Publish directory:** `dist`
4. Click **Deploy site**

### Step 3 — Add your API key
1. In Netlify dashboard → **Site configuration** → **Environment variables**
2. Click **Add a variable**
3. Key: `ANTHROPIC_API_KEY`
4. Value: your Claude API key (from [console.anthropic.com](https://console.anthropic.com))
5. Click **Save** and trigger a **Redeploy**

That's it — your site is live!

---

## File Types Supported
| Format | Notes |
|--------|-------|
| PDF    | Text is extracted; scanned/image-only PDFs won't parse |
| CSV    | Any delimiter — policy data, loss runs, etc. |
| XLSX / XLS | All sheets are read and combined |
| TXT    | Plain text or structured data |
| JSON   | Raw JSON data |

## Data Points Extracted
- Document type & plain-English summary
- Named insured + additional insureds
- Insurer / carrier details
- Agent / broker contact info
- Policy number, type, effective/expiration dates
- Total premium + payment schedule
- Coverage types, limits, aggregates, deductibles
- Property description and address
- Scheduled vehicles (VIN, year/make/model)
- Claim information (if present)
- Other parties (mortgagees, loss payees, certificate holders)
- Loss history
- Endorsements
- Notable exclusions
- Flags / items needing attention

## Notes
- Files over ~45MB may time out — most insurance docs are well under this
- Image-only PDFs (scanned without OCR) won't yield text; the tool will surface an error
- The AI model used is Claude Sonnet — you can change this in `netlify/functions/parse-document.cjs`
