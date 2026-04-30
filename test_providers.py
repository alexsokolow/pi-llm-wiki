#!/usr/bin/env python3
"""
Test script for LLM Wiki multi-provider client.
Tests GitHub Copilot, OpenRouter, and Ollama connectivity.
"""

import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

# Load auth from pi config
AUTH_PATH = Path.home() / ".pi" / "agent" / "auth.json"

def load_auth():
    if not AUTH_PATH.exists():
        print(f"❌ Auth file not found: {AUTH_PATH}")
        sys.exit(1)
    with open(AUTH_PATH) as f:
        return json.load(f)

def test_copilot(auth):
    """Test GitHub Copilot proxy endpoint"""
    print("\n━━━ Testing GitHub Copilot ━━━")
    copilot = auth.get("github-copilot")
    if not copilot or not copilot.get("access"):
        print("⚠️  No Copilot credentials found")
        return False

    token = copilot["access"]
    endpoint = "https://api.githubcopilot.com/chat/completions"
    
    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant. Reply in one sentence."},
            {"role": "user", "content": "Say hello and confirm you're working."}
        ],
        "max_tokens": 100,
        "stream": False
    }).encode()

    req = Request(endpoint, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Editor-Version", "vscode/1.99.0")
    req.add_header("Copilot-Integration-Id", "vscode-chat")
    req.add_header("Editor-Plugin-Version", "copilot-chat/0.25.0")

    try:
        resp = urlopen(req, timeout=30)
        data = json.loads(resp.read())
        content = data["choices"][0]["message"]["content"]
        print(f"✅ Copilot OK (gpt-4o-mini): {content}")
        return True
    except HTTPError as e:
        body = e.read().decode()
        print(f"❌ Copilot HTTP {e.code}: {body[:200]}")
        return False
    except Exception as e:
        print(f"❌ Copilot error: {e}")
        return False


def test_copilot_stream(auth):
    """Test GitHub Copilot with streaming"""
    print("\n━━━ Testing GitHub Copilot (streaming) ━━━")
    copilot = auth.get("github-copilot")
    if not copilot or not copilot.get("access"):
        print("⚠️  No Copilot credentials found")
        return False

    token = copilot["access"]
    endpoint = "https://api.githubcopilot.com/chat/completions"
    
    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "user", "content": "Count from 1 to 5, one number per line."}
        ],
        "max_tokens": 100,
        "stream": True
    }).encode()

    req = Request(endpoint, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Editor-Version", "vscode/1.99.0")
    req.add_header("Copilot-Integration-Id", "vscode-chat")
    req.add_header("Editor-Plugin-Version", "copilot-chat/0.25.0")

    try:
        resp = urlopen(req, timeout=30)
        full_text = ""
        print("  Stream: ", end="", flush=True)
        for line in resp:
            line = line.decode().strip()
            if not line.startswith("data: "):
                continue
            data = line[6:]
            if data == "[DONE]":
                break
            try:
                chunk = json.loads(data)
                choices = chunk.get("choices", [])
                if not choices:
                    continue
                content = choices[0].get("delta", {}).get("content", "")
                if content:
                    print(content, end="", flush=True)
                    full_text += content
            except json.JSONDecodeError:
                pass
        print()
        print(f"✅ Copilot streaming OK ({len(full_text)} chars)")
        return True
    except HTTPError as e:
        body = e.read().decode()
        print(f"\n❌ Copilot stream HTTP {e.code}: {body[:200]}")
        return False
    except Exception as e:
        print(f"\n❌ Copilot stream error: {e}")
        return False


def test_openrouter(auth):
    """Test OpenRouter endpoint"""
    print("\n━━━ Testing OpenRouter ━━━")
    or_config = auth.get("openrouter")
    if not or_config or not or_config.get("key"):
        print("⚠️  No OpenRouter credentials found")
        return False

    key = or_config["key"]
    endpoint = "https://openrouter.ai/api/v1/chat/completions"
    
    body = json.dumps({
        "model": "google/gemini-2.0-flash-001",
        "messages": [
            {"role": "user", "content": "Say hello in exactly 5 words."}
        ],
        "max_tokens": 50,
        "stream": False
    }).encode()

    req = Request(endpoint, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {key}")
    req.add_header("HTTP-Referer", "http://localhost:3000")
    req.add_header("X-Title", "LLM Wiki Test")

    try:
        resp = urlopen(req, timeout=30)
        data = json.loads(resp.read())
        content = data["choices"][0]["message"]["content"]
        print(f"✅ OpenRouter OK (gemini-2.0-flash): {content}")
        return True
    except HTTPError as e:
        body = e.read().decode()
        print(f"❌ OpenRouter HTTP {e.code}: {body[:200]}")
        return False
    except Exception as e:
        print(f"❌ OpenRouter error: {e}")
        return False


def test_ollama():
    """Test local Ollama"""
    print("\n━━━ Testing Ollama (local) ━━━")
    endpoint = "http://localhost:11434/api/tags"

    req = Request(endpoint)
    try:
        resp = urlopen(req, timeout=5)
        data = json.loads(resp.read())
        models = [m["name"] for m in data.get("models", [])]
        print(f"✅ Ollama running — models: {', '.join(models) or '(none)'}")
        return True
    except URLError:
        print("⚠️  Ollama not running (that's fine, using cloud providers)")
        return False
    except Exception as e:
        print(f"⚠️  Ollama error: {e}")
        return False


def test_wiki_ingest(auth):
    """Test a full wiki ingest cycle via Copilot"""
    print("\n━━━ Testing Wiki Ingest (end-to-end) ━━━")
    copilot = auth.get("github-copilot")
    if not copilot or not copilot.get("access"):
        print("⚠️  Skipping (no Copilot credentials)")
        return False

    token = copilot["access"]
    endpoint = "https://api.githubcopilot.com/chat/completions"

    sample_source = """# Meeting Notes - Project Alpha
Date: 2026-04-28
Attendees: Sarah Chen (PM), Marcus Williams (Dev Lead), Lisa Park (QA)

Key decisions:
- Migrate from PostgreSQL to CockroachDB for horizontal scaling
- Target launch date: June 15, 2026
- Lisa raised concern about test coverage being at 62%, wants 80% minimum
- Marcus proposed using feature flags for gradual rollout
- Budget approved: $45k for cloud infrastructure
"""

    prompt = f"""Source document: meeting-notes-alpha.md

Content:
---
{sample_source}
---

Process this according to a wiki schema. Output ONLY a JSON object with this exact shape:
{{
  "sourcePage": {{ "path": "sources/meeting-notes-alpha.md", "content": "..." }},
  "updates": [
    {{ "path": "entities/..." OR "concepts/...", "content": "..." }}
  ],
  "indexSnippet": "markdown snippet to insert into index.md"
}}

Rules:
- All content must be valid markdown with YAML frontmatter.
- Use [[Title]] cross-references.
- Frontmatter must include: title, date, tags, source_count, last_updated.
"""

    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {"role": "system", "content": "You are a wiki maintainer. Output valid JSON only."},
            {"role": "user", "content": prompt}
        ],
        "max_tokens": 2000,
        "stream": False
    }).encode()

    req = Request(endpoint, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Editor-Version", "vscode/1.99.0")
    req.add_header("Copilot-Integration-Id", "vscode-chat")
    req.add_header("Editor-Plugin-Version", "copilot-chat/0.25.0")

    try:
        resp = urlopen(req, timeout=60)
        data = json.loads(resp.read())
        content = data["choices"][0]["message"]["content"]
        
        # Try to parse the JSON
        import re
        json_match = re.search(r'\{[\s\S]*\}', content)
        if json_match:
            result = json.loads(json_match.group())
            pages_created = 1 + len(result.get("updates", []))
            print(f"✅ Ingest OK — {pages_created} pages would be created:")
            print(f"   Source: {result.get('sourcePage', {}).get('path', '?')}")
            for upd in result.get("updates", []):
                print(f"   Update: {upd.get('path', '?')}")
            return True
        else:
            print(f"⚠️  Got response but no valid JSON:")
            print(f"   {content[:200]}")
            return False
    except HTTPError as e:
        body = e.read().decode()
        print(f"❌ Ingest HTTP {e.code}: {body[:200]}")
        return False
    except Exception as e:
        print(f"❌ Ingest error: {e}")
        return False


if __name__ == "__main__":
    print("🧪 LLM Wiki Provider Test")
    print(f"   Auth: {AUTH_PATH}")
    
    auth = load_auth()
    results = {}
    
    results["ollama"] = test_ollama()
    results["copilot"] = test_copilot(auth)
    results["copilot_stream"] = test_copilot_stream(auth)
    results["openrouter"] = test_openrouter(auth)
    results["ingest"] = test_wiki_ingest(auth)

    print("\n━━━ Summary ━━━")
    for name, ok in results.items():
        icon = "✅" if ok else "❌"
        print(f"  {icon} {name}")
    
    working = [k for k, v in results.items() if v]
    if working:
        print(f"\n🎉 {len(working)}/{len(results)} tests passed. Cloud providers are ready!")
    else:
        print(f"\n💀 All tests failed. Check credentials in {AUTH_PATH}")
    
    sys.exit(0 if any(results.values()) else 1)
