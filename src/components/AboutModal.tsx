import React, { useState, useEffect } from 'react';
import { X, Github, ExternalLink, RefreshCw } from 'lucide-react';
import {
  APP_VERSION,
  APP_AUTHOR,
  APP_AUTHOR_URL,
  APP_REPO,
  APP_REPO_NAME,
  APP_LICENSE_SHORT,
  checkLatestRelease,
  GitHubReleaseInfo,
} from '../services/githubVersion';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const [releaseInfo, setReleaseInfo] = useState<GitHubReleaseInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsCheckingUpdate(true);

    checkLatestRelease()
      .then((info) => {
        if (isMounted && info) setReleaseInfo(info);
      })
      .finally(() => {
        if (isMounted) setIsCheckingUpdate(false);
      });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      isMounted = false;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-surface-container-lowest border border-surface-container-high rounded-xl shadow-2xl p-6 flex flex-col items-center text-center relative animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3.5 right-3.5 p-1 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
          aria-label="Tutup"
        >
          <X className="w-4 h-4" />
        </button>

        {/* App Icon */}
        <img
          src="/logo.png"
          alt="pgStudio Logo"
          className="w-13 h-13 rounded-xl object-contain mb-3 shadow-xs border border-outline-variant/20"
        />

        {/* Title & Version */}
        <h2 className="text-base font-bold text-on-surface tracking-tight">pgStudio</h2>
        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-on-surface-variant font-mono">
          <span>{APP_VERSION}</span>
          <span>•</span>
          {isCheckingUpdate ? (
            <span className="flex items-center gap-1 text-[11px] text-on-surface-variant/70">
              <RefreshCw className="w-3 h-3 animate-spin" /> checking...
            </span>
          ) : releaseInfo?.hasUpdate ? (
            <a
              href={releaseInfo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:underline text-[11px]"
            >
              Update available ({releaseInfo.tagName})
            </a>
          ) : (
            <span className="text-emerald-400 text-[11px]">Up to date</span>
          )}
        </div>

        <p className="text-xs text-on-surface-variant mt-2 max-w-[260px] leading-relaxed">
          PostgreSQL Database Management Suite &amp; DevOps Terminal.
        </p>

        {/* Info Rows */}
        <div className="w-full mt-5 pt-4 border-t border-surface-container-high/60 space-y-2 text-xs">
          <div className="flex items-center justify-between py-1 px-1 text-on-surface-variant">
            <span>Author</span>
            <a
              href={APP_AUTHOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline font-medium inline-flex items-center gap-1"
            >
              @{APP_AUTHOR}
              <ExternalLink className="w-3 h-3 text-on-surface-variant/60" />
            </a>
          </div>

          <div className="flex items-center justify-between py-1 px-1 text-on-surface-variant">
            <span>License</span>
            <span className="text-on-surface font-mono text-[11px]">{APP_LICENSE_SHORT}</span>
          </div>

          <div className="flex items-center justify-between py-1 px-1 text-on-surface-variant">
            <span>Repository</span>
            <a
              href={APP_REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="text-on-surface hover:text-primary transition-colors font-mono text-[11px] inline-flex items-center gap-1"
            >
              {APP_REPO_NAME}
              <ExternalLink className="w-3 h-3 text-on-surface-variant/60" />
            </a>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full grid grid-cols-2 gap-2 mt-5">
          <a
            href={APP_REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors text-xs font-medium border border-outline-variant/30"
          >
            <Github className="w-3.5 h-3.5" />
            <span>GitHub</span>
          </a>
          <a
            href={`${APP_REPO}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface transition-colors text-xs font-medium border border-outline-variant/30"
          >
            <span>Releases</span>
            <ExternalLink className="w-3 h-3 text-on-surface-variant" />
          </a>
        </div>

        {/* Minimal Copyright */}
        <div className="mt-4 text-[10px] text-on-surface-variant/60">
          © {new Date().getFullYear()} {APP_AUTHOR}. Free and open source.
        </div>
      </div>
    </div>
  );
};
