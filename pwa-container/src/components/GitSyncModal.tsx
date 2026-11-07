/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  ExternalLink,
  Check,
  AlertCircle,
  RefreshCw,
  X,
  UploadCloud,
  Key,
  FolderGit2,
  Terminal,
  Copy,
} from 'lucide-react';

interface GitStatusResponse {
  success: boolean;
  branch: string;
  lastCommit?: {
    hash: string;
    author: string;
    date: string;
    message: string;
  } | null;
  remoteUrl?: string;
  rawRemoteUrlPresent?: boolean;
  dirty: boolean;
  changedFiles: string[];
  commitCount: number;
  error?: string;
}

interface GitSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GitSyncModal: React.FC<GitSyncModalProps> = ({ isOpen, onClose }) => {
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [token, setToken] = useState('');
  const [branch, setBranch] = useState('main');
  const [commitMessage, setCommitMessage] = useState('sync: update OpenSeizureDetector Polar BLE app');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    details?: string;
    hint?: string;
  } | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const fetchStatus = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/git/status');
      const data = await res.json();
      if (data.success) {
        setGitStatus(data);
        if (data.remoteUrl && !remoteUrl) {
          setRemoteUrl(data.remoteUrl);
        }
        if (data.branch) {
          setBranch(data.branch);
        }
      }
    } catch (e) {
      console.error('Failed to fetch git status:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setSyncResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSync = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteUrl.trim()) return;

    setIsSyncing(true);
    setSyncResult(null);

    try {
      const res = await fetch('/api/git/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remoteUrl: remoteUrl.trim(),
          token: token.trim(),
          branch: branch.trim() || 'main',
          commitMessage: commitMessage.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSyncResult({
          success: true,
          message: data.message || 'Pushed successfully to GitHub!',
          details: data.details,
        });
        fetchStatus();
      } else {
        setSyncResult({
          success: false,
          message: data.error || 'Push failed.',
          hint: data.hint,
        });
      }
    } catch (err) {
      setSyncResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const cliSnippet = `# In local terminal / app directory:
git remote add origin ${remoteUrl.trim() || 'https://github.com/<username>/<repo>.git'}
git branch -M ${branch || 'main'}
git push -u origin ${branch || 'main'}`;

  const handleCopyCli = () => {
    navigator.clipboard.writeText(cliSnippet);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <FolderGit2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Sync to GitHub
                <span className="text-[10px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  {gitStatus?.branch || 'main'}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Push code, commits, and Polar BLE stream algorithms directly to your GitHub repository
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 font-sans text-xs">
          {/* Current Git Status Card */}
          <div className="bg-slate-950 rounded-xl border border-slate-800 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-sky-400" />
                Repository State
              </span>
              <button
                type="button"
                onClick={fetchStatus}
                disabled={isLoading}
                className="text-slate-400 hover:text-slate-200 flex items-center gap-1 text-[11px]"
                title="Refresh Git status"
              >
                <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-slate-400 text-[11px] font-mono">
              <div>
                <span className="text-slate-500">Branch: </span>
                <span className="text-white font-semibold">{gitStatus?.branch || 'main'}</span>
              </div>
              <div>
                <span className="text-slate-500">Total Commits: </span>
                <span className="text-white font-semibold">{gitStatus?.commitCount ?? 1}</span>
              </div>
              <div className="col-span-2 truncate">
                <span className="text-slate-500">Latest Commit: </span>
                <span className="text-emerald-400 font-bold">{gitStatus?.lastCommit?.hash || '9558e0c'}</span>{' '}
                <span className="text-slate-300">
                  {gitStatus?.lastCommit?.message || 'OpenSeizureDetector Polar BLE stream setup'}
                </span>
              </div>
              {gitStatus?.remoteUrl && (
                <div className="col-span-2 truncate">
                  <span className="text-slate-500">Remote Origin: </span>
                  <span className="text-sky-300">{gitStatus.remoteUrl}</span>
                </div>
              )}
            </div>

            {gitStatus?.dirty && (
              <div className="text-[11px] text-amber-400 bg-amber-950/30 border border-amber-900/50 rounded-lg p-2">
                Uncommitted modifications present ({gitStatus.changedFiles.length} files). These will be automatically staged and committed during sync.
              </div>
            )}
          </div>

          {/* Sync Form */}
          <form onSubmit={handleSync} className="space-y-4">
            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                <span>GitHub Repository URL <span className="text-rose-400">*</span></span>
                <a
                  href="https://github.com/new"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline flex items-center gap-1 text-[11px]"
                >
                  Create repo on GitHub <ExternalLink className="w-3 h-3" />
                </a>
              </label>
              <input
                type="text"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="https://github.com/username/openseizuredetector-loop2.git"
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-sky-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Enter your target GitHub HTTPS repository URL.
              </p>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1">
                  <Key className="w-3.5 h-3.5 text-amber-400" />
                  GitHub Personal Access Token (PAT)
                </span>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:underline flex items-center gap-1 text-[11px]"
                >
                  Generate Token (repo scope) <ExternalLink className="w-3 h-3" />
                </a>
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-amber-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                Required by GitHub for write access. Your token stays server-side for the push and is never exposed in client logs.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Branch Name
                </label>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Commit Message
                </label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="sync: updates"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            {/* Sync Feedback Alert */}
            {syncResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                  syncResult.success
                    ? 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
                    : 'bg-rose-950/70 border-rose-800 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {syncResult.success ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400" />
                  )}
                  <span>{syncResult.message}</span>
                </div>
                {syncResult.details && (
                  <pre className="font-mono text-[10px] text-slate-300 bg-slate-950/60 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                    {syncResult.details}
                  </pre>
                )}
                {syncResult.hint && (
                  <div className="text-[11px] text-amber-300 bg-amber-950/40 p-2 rounded border border-amber-900/40">
                    💡 <strong>Hint:</strong> {syncResult.hint}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={isSyncing || !remoteUrl.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold shadow-lg shadow-sky-600/25 transition-all"
              >
                {isSyncing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Pushing to GitHub...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4" />
                    <span>Push &amp; Sync to GitHub</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Quick CLI Reference */}
          <div className="border-t border-slate-800/80 pt-4 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                Manual Terminal Push Commands
              </span>
              <button
                type="button"
                onClick={handleCopyCli}
                className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px]"
              >
                {copiedCmd ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedCmd ? 'Copied' : 'Copy commands'}</span>
              </button>
            </div>
            <pre className="font-mono text-[10px] bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-slate-300 overflow-x-auto">
              {cliSnippet}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
