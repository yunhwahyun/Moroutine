import React from 'react'

export function renderLineBreaks(text: string): React.ReactNode {
  const lines = text.split(/\r?\n/)
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </React.Fragment>
  ))
}
