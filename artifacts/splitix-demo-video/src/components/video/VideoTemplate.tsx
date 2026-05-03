import { useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import { Scene6 } from './video_scenes/Scene6';

export const SCENE_DURATIONS = {
  hook: 5000,
  group: 6000,
  expense: 8000,
  balances: 7000,
  settle: 6000,
  outro: 5000,
};

const SCENE_COMPONENTS: Record<string, React.ComponentType> = {
  hook: Scene1,
  group: Scene2,
  expense: Scene3,
  balances: Scene4,
  settle: Scene5,
  outro: Scene6,
};

const SCENE_BG: Record<string, string> = {
  hook: 'var(--color-bg-dark)',
  group: 'var(--color-bg-light)',
  expense: 'var(--color-bg-muted)',
  balances: 'var(--color-bg-dark)',
  settle: 'var(--color-primary)',
  outro: 'var(--color-bg-light)',
};

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop });

  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);

  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '');
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];
  const bg = SCENE_BG[baseSceneKey] ?? 'var(--color-bg-dark)';

  return (
    <div
      className="w-full h-screen overflow-hidden relative"
      style={{ backgroundColor: bg }}
    >
      <AnimatePresence initial={false} mode="wait">
        {SceneComponent && <SceneComponent key={currentSceneKey} />}
      </AnimatePresence>
    </div>
  );
}
