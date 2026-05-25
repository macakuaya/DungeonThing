import { TILES } from '../tiles'
import { DraggableTile } from './DraggableTile'

export function Sidebar() {
  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">Tiles</h2>
      <p className="sidebar-hint">Drag onto the grid. Each cell = 5 ft.</p>
      <div className="sidebar-tiles">
        {TILES.map((tile) => (
          <DraggableTile key={tile.id} tile={tile} />
        ))}
      </div>
    </aside>
  )
}
