"use client"

import { createSystem, defaultConfig } from "@chakra-ui/react"

const system = createSystem(defaultConfig, {
  theme: {
    tokens: {
      fonts: {
        heading: { value: "Roboto" },
        body: { value: "Roboto" },
      },
    },
  },

  
})


